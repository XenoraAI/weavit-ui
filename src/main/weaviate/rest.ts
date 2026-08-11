import type { ConnectionConfig } from '@shared/types'
import { getClient, getConnectionConfig } from './connectionManager'
import { getSecret } from '../store/store'

// A thin REST layer for endpoints the typed client doesn't expose directly
// (/v1/meta, /v1/nodes, raw GraphQL, and the arbitrary REST console).
// Electron's main process (Node 22) provides a global fetch.

export function baseUrl(cfg: ConnectionConfig): string {
  if (cfg.type === 'local') {
    const host = cfg.localHost || 'localhost'
    const port = cfg.localPort || 8080
    return `http://${host}:${port}`
  }
  if (cfg.type === 'cloud') {
    if (!cfg.clusterUrl) throw new Error('Cloud connection is missing a cluster URL')
    return cfg.clusterUrl.replace(/\/+$/, '')
  }
  const scheme = cfg.httpSecure ? 'https' : 'http'
  const host = cfg.httpHost || 'localhost'
  const port = cfg.httpPort || 8080
  return `${scheme}://${host}:${port}`
}

const OIDC_AUTH_TYPES = new Set(['oidcPassword', 'oidcClientCredentials', 'oidcToken'])

/**
 * An API key is a bearer token as-is. Under OIDC the usable token is whatever
 * the client negotiated (and keeps refreshed), so we borrow it from the client
 * rather than trying to run the token exchange a second time here.
 */
async function authHeaders(cfg: ConnectionConfig): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (cfg.authType === 'apiKey') {
    const key = getSecret(cfg.id)
    if (key) headers['Authorization'] = `Bearer ${key}`
  } else if (OIDC_AUTH_TYPES.has(cfg.authType)) {
    try {
      const details = await (await getClient(cfg.id)).getConnectionDetails()
      if (details?.bearerToken) headers['Authorization'] = `Bearer ${details.bearerToken}`
    } catch {
      // Leave the request unauthenticated; the server's 401 is a clearer
      // signal than a failure to build the header would be.
    }
  }

  if (cfg.headers) Object.assign(headers, cfg.headers)
  return headers
}

export interface RestCallResult {
  status: number
  ok: boolean
  data: unknown
}

export async function restCall(
  connectionId: string,
  method: string,
  path: string,
  body?: string
): Promise<RestCallResult> {
  const cfg = getConnectionConfig(connectionId)
  const url = baseUrl(cfg) + (path.startsWith('/') ? path : `/${path}`)
  const res = await fetch(url, {
    method,
    headers: await authHeaders(cfg),
    body: body && method !== 'GET' && method !== 'HEAD' ? body : undefined
  })
  const text = await res.text()
  let data: unknown = text
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* keep raw text */
  }
  return { status: res.status, ok: res.ok, data }
}

export async function graphql(connectionId: string, query: string): Promise<RestCallResult> {
  return restCall(connectionId, 'POST', '/v1/graphql', JSON.stringify({ query }))
}
