import weaviate, { type WeaviateClient } from 'weaviate-client'
import type { ConnectionConfig } from '@shared/types'
import { loadConnections, getSecret } from '../store/store'

// Builds and caches one WeaviateClient per connection profile. All Weaviate
// access in the app funnels through here.

const clients = new Map<string, WeaviateClient>()

export function getConnectionConfig(id: string): ConnectionConfig {
  const cfg = loadConnections().find((c) => c.id === id)
  if (!cfg) throw new Error(`Connection not found: ${id}`)
  return cfg
}

function authCredentials(cfg: ConnectionConfig): InstanceType<typeof weaviate.ApiKey> | undefined {
  if (cfg.authType === 'apiKey') {
    const key = getSecret(cfg.id)
    if (key) return new weaviate.ApiKey(key)
  }
  return undefined
}

async function build(cfg: ConnectionConfig): Promise<WeaviateClient> {
  const authCreds = authCredentials(cfg)
  const headers = cfg.headers && Object.keys(cfg.headers).length ? cfg.headers : undefined

  if (cfg.type === 'local') {
    return weaviate.connectToLocal({
      host: cfg.localHost || 'localhost',
      port: cfg.localPort || 8080,
      grpcPort: cfg.localGrpcPort || 50051,
      authCredentials: authCreds,
      headers
    })
  }

  if (cfg.type === 'cloud') {
    if (!cfg.clusterUrl) throw new Error('Cloud connection is missing a cluster URL')
    return weaviate.connectToWeaviateCloud(cfg.clusterUrl, {
      authCredentials: authCreds,
      headers
    })
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
    authCredentials: authCreds,
    headers
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
