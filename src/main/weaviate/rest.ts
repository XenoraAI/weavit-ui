import type { ConnectionConfig } from '@shared/types'
import { getConnectionConfig } from './connectionManager'
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

function authHeaders(cfg: ConnectionConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.authType === 'apiKey') {
    const key = getSecret(cfg.id)
    if (key) headers['Authorization'] = `Bearer ${key}`
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
    headers: authHeaders(cfg),
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
