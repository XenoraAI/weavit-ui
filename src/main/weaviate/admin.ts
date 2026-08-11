import { getClient } from './connectionManager'
import { restCall } from './rest'
import type {
  HealthResult,
  NodesResult,
  TokenizeRequest,
  TokenizeResult,
  WeaviateMeta
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function getMeta(connectionId: string): Promise<WeaviateMeta> {
  const res = await restCall(connectionId, 'GET', '/v1/meta')
  if (!res.ok) throw new Error(`meta request failed with status ${res.status}`)
  const data = res.data as any
  return {
    version: data?.version,
    hostname: data?.hostname,
    modules: data?.modules
  }
}

export async function getNodes(connectionId: string): Promise<NodesResult> {
  const res = await restCall(connectionId, 'GET', '/v1/nodes?output=verbose')
  if (!res.ok) throw new Error(`nodes request failed with status ${res.status}`)
  const data = res.data as any
  return { nodes: Array.isArray(data?.nodes) ? data.nodes : [] }
}

/**
 * Liveness and readiness. These are the cheap probes Weaviate exposes for
 * exactly this purpose — far lighter than listing collections to prove the
 * connection is alive. Neither probe throws: a failure is reported as false.
 */
export async function health(connectionId: string): Promise<HealthResult> {
  const client = await getClient(connectionId)
  const [live, ready, version] = await Promise.all([
    client.isLive().catch(() => false),
    client.isReady().catch(() => false),
    client
      .getWeaviateVersion()
      .then((v: any) => (typeof v?.show === 'function' ? v.show() : String(v)))
      .catch(() => undefined)
  ])
  return { live, ready, version }
}

function toTokenList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  // Entries are plain strings today, but tolerate a {token} wrapper.
  return value.map((t: any) => String(t?.token ?? t))
}

/**
 * Shows how Weaviate would split text into tokens — either under a named
 * tokenization strategy, or under whatever a given property is configured with.
 * Useful for working out why a BM25 query isn't matching what you expect.
 *
 * The server answers with two lists: `indexed` is what gets written to the
 * inverted index, `query` is what a search term is reduced to. They differ
 * wherever stopwords are involved, which is usually the surprise.
 */
export async function tokenize(req: TokenizeRequest): Promise<TokenizeResult> {
  const client = await getClient(req.connectionId)
  const text = req.text ?? ''
  if (!text.trim()) return { tokens: [] }

  const result: any =
    req.collection && req.property
      ? await client.tokenize.forProperty(req.collection, req.property, text)
      : await client.tokenize.text(text, (req.tokenization ?? 'word') as any)

  // Older shapes returned a bare array or a `tokens` field.
  const indexed = result?.indexed ?? result?.tokens ?? result
  return { tokens: toTokenList(indexed), queryTokens: toTokenList(result?.query) }
}
