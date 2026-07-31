import { restCall } from './rest'
import type { NodesResult, WeaviateMeta } from '@shared/types'

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
