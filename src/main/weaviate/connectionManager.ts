import weaviate, { type WeaviateClient } from 'weaviate-client'
import type { ConnectionConfig } from '@shared/types'
import { loadConnections, getSecret } from '../store/store'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Builds and caches one WeaviateClient per connection profile. All Weaviate
// access in the app funnels through here.

const clients = new Map<string, WeaviateClient>()

export function getConnectionConfig(id: string): ConnectionConfig {
  const cfg = loadConnections().find((c) => c.id === id)
  if (!cfg) throw new Error(`Connection not found: ${id}`)
  return cfg
}

/**
 * The one stored secret means something different per auth type: the API key,
 * the user's password, the OIDC client secret, or a bearer access token.
 */
function authCredentials(cfg: ConnectionConfig): any | undefined {
  const secret = getSecret(cfg.id)
  const scopes = (cfg.oidcScopes ?? []).filter(Boolean)

  switch (cfg.authType) {
    case 'apiKey':
      return secret ? new weaviate.ApiKey(secret) : undefined
    case 'oidcPassword': {
      if (!cfg.oidcUsername) throw new Error('OIDC password auth requires a username')
      return new (weaviate as any).AuthUserPasswordCredentials({
        username: cfg.oidcUsername,
        password: secret ?? undefined,
        scopes: scopes.length ? scopes : undefined
      })
    }
    case 'oidcClientCredentials': {
      if (!secret) throw new Error('OIDC client credentials auth requires a client secret')
      return new (weaviate as any).AuthClientCredentials({
        clientSecret: secret,
        scopes: scopes.length ? scopes : undefined
      })
    }
    case 'oidcToken': {
      if (!secret) throw new Error('OIDC token auth requires an access token')
      // The client insists on an expiry; without a real one, claim an hour and
      // let a 401 surface naturally rather than refusing to connect at all.
      return new (weaviate as any).AuthAccessTokenCredentials({
        accessToken: secret,
        expiresIn: 3600
      })
    }
    default:
      return undefined
  }
}

function timeoutParams(cfg: ConnectionConfig): any | undefined {
  const t = cfg.timeout
  if (!t) return undefined
  const out: any = {}
  if (t.init != null) out.init = t.init
  if (t.query != null) out.query = t.query
  if (t.insert != null) out.insert = t.insert
  return Object.keys(out).length ? out : undefined
}

/** Only a gRPC proxy is supported; an HTTP forwarding proxy is configured by
 *  pointing the connection's host at the proxy instead. */
function proxyParams(cfg: ConnectionConfig): any | undefined {
  const grpc = cfg.proxies?.grpc?.trim()
  return grpc ? { grpc } : undefined
}

async function build(cfg: ConnectionConfig): Promise<WeaviateClient> {
  const authCreds = authCredentials(cfg)
  const headers = cfg.headers && Object.keys(cfg.headers).length ? cfg.headers : undefined
  const timeout = timeoutParams(cfg)
  const proxies = proxyParams(cfg)
  const skipInitChecks = cfg.skipInitChecks || undefined

  const shared: any = { authCredentials: authCreds, headers, timeout, proxies, skipInitChecks }

  if (cfg.type === 'local') {
    return weaviate.connectToLocal({
      host: cfg.localHost || 'localhost',
      port: cfg.localPort || 8080,
      grpcPort: cfg.localGrpcPort || 50051,
      ...shared
    })
  }

  if (cfg.type === 'cloud') {
    if (!cfg.clusterUrl) throw new Error('Cloud connection is missing a cluster URL')
    return weaviate.connectToWeaviateCloud(cfg.clusterUrl, shared)
  }

  // custom
  if (!cfg.httpHost || !cfg.grpcHost) {
    throw new Error('Custom connection requires both HTTP host and gRPC host')
  }
  return weaviate.connectToCustom({
    httpHost: cfg.httpHost,
    httpPort: cfg.httpPort || 8080,
    httpSecure: cfg.httpSecure ?? false,
    grpcHost: cfg.grpcHost,
    grpcPort: cfg.grpcPort || 50051,
    grpcSecure: cfg.grpcSecure ?? false,
    ...shared
  })
}

/** Returns a cached, connected client, creating one on first use. */
export async function getClient(id: string): Promise<WeaviateClient> {
  const existing = clients.get(id)
  if (existing) return existing
  const cfg = getConnectionConfig(id)
  const client = await build(cfg)
  clients.set(id, client)
  return client
}

/** Drops (and closes) a cached client — call after editing a connection. */
export async function evictClient(id: string): Promise<void> {
  const client = clients.get(id)
  clients.delete(id)
  if (client) {
    try {
      await client.close()
    } catch {
      /* ignore close errors */
    }
  }
}

export async function closeAll(): Promise<void> {
  await Promise.all([...clients.keys()].map((id) => evictClient(id)))
}
