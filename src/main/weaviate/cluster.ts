import { getClient } from './connectionManager'
import { restCall, type RestCallResult } from './rest'
import { normalizeForIpc } from '../util'
import type {
  ClusterFeatureAvailability,
  ClusterNodeInfo,
  ReplicateRequest,
  ReplicationListResult,
  ReplicationOp,
  ShardingStateResult,
  ShardStatus
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Cluster topology and shard movement. The typed client returns richer data
// than /v1/nodes does by hand, including per-shard object counts and the
// vector-indexing status that tells you whether a shard is still catching up.

function toNode(raw: any): ClusterNodeInfo {
  return normalizeForIpc<ClusterNodeInfo>({
    name: raw?.name,
    status: raw?.status,
    version: raw?.version,
    gitHash: raw?.gitHash,
    shards: (raw?.shards ?? []).map((s: any) => ({
      name: s?.name,
      class: s?.class,
      objectCount: s?.objectCount,
      vectorIndexingStatus: s?.vectorIndexingStatus,
      vectorQueueLength: s?.vectorQueueLength,
      compressed: s?.compressed,
      loaded: s?.loaded
    })),
    stats: raw?.stats
      ? { shardCount: raw.stats.shardCount, objectCount: raw.stats.objectCount }
      : undefined,
    batchStats: raw?.batchStats
  })
}

export async function nodes(
  connectionId: string,
  collection?: string
): Promise<ClusterNodeInfo[]> {
  const client = await getClient(connectionId)
  // 'verbose' is what carries the per-shard detail; 'minimal' omits it entirely.
  const raw = await client.cluster.nodes({ output: 'verbose', collection })
  return (Array.isArray(raw) ? raw : []).map(toNode)
}

// ── Replica movement ────────────────────────────────────────────────────────

// Replica movement is optional: the endpoints exist from Weaviate 1.32, but an
// instance that isn't running the replication engine answers 501 ("Replica
// movement operations are disabled") and older servers answer 404. Neither is
// a fault worth throwing — they describe the instance, so they come back as an
// availability verdict the UI can explain calmly.

const AVAILABLE: ClusterFeatureAvailability = { available: true }

/** Pull the human-readable part out of a Weaviate error body, if there is one. */
function serverMessage(data: unknown): string | undefined {
  if (typeof data === 'string') return data.trim() || undefined
  if (!data || typeof data !== 'object') return undefined
  const body = data as any
  if (typeof body.message === 'string' && body.message) return body.message
  if (Array.isArray(body.error)) {
    const parts = body.error.map((e: any) => e?.message).filter(Boolean)
    if (parts.length) return parts.join('; ')
  }
  return undefined
}

function unavailable(res: RestCallResult): ClusterFeatureAvailability {
  const reason: ClusterFeatureAvailability['reason'] =
    res.status === 501
      ? 'notImplemented'
      : res.status === 404 || res.status === 405
        ? 'notFound'
        : res.status === 401 || res.status === 403
          ? 'unauthorized'
          : 'error'
  return { available: false, reason, detail: serverMessage(res.data) }
}

export async function shardingState(
  connectionId: string,
  collection: string
): Promise<ShardingStateResult> {
  const res = await restCall(
    connectionId,
    'GET',
    `/v1/replication/sharding-state?collection=${encodeURIComponent(collection)}`
  )
  if (!res.ok) return { collection, shards: [], availability: unavailable(res) }

  const state: any = (res.data as any)?.shardingState ?? res.data
  return normalizeForIpc<ShardingStateResult>({
    collection: state?.collection ?? collection,
    shards: (state?.shards ?? []).map((s: any) => ({
      shard: s?.shard,
      replicas: s?.replicas ?? []
    })),
    availability: AVAILABLE
  })
}

/**
 * Starts moving or copying one shard replica between nodes. Returns the
 * operation ID to poll — the transfer itself runs asynchronously on the server.
 */
export async function replicate(req: ReplicateRequest): Promise<{ id: string }> {
  const client = await getClient(req.connectionId)
  const id = await client.cluster.replicate({
    collection: req.collection,
    shard: req.shard,
    sourceNode: req.sourceNode,
    targetNode: req.targetNode,
    replicationType: req.replicationType as any
  })
  return { id }
}

function toReplicationOp(raw: any): ReplicationOp {
  return normalizeForIpc<ReplicationOp>({
    id: raw?.id ?? raw?.uuid,
    collection: raw?.collection,
    shard: raw?.shardId ?? raw?.shard,
    sourceNode: raw?.sourceNodeId ?? raw?.sourceNode,
    targetNode: raw?.targetNodeId ?? raw?.targetNode,
    status: raw?.status?.state ?? raw?.status,
    type: raw?.transferType ?? raw?.type,
    raw
  })
}

/**
 * Deliberately not the typed client's `replications.query()`: that GETs
 * /replication/replicate, a path the server only routes for POST and DELETE,
 * so it always comes back 405. The documented read path is .../replicate/list.
 */
export async function listReplications(
  connectionId: string,
  collection?: string
): Promise<ReplicationListResult> {
  const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
  const res = await restCall(connectionId, 'GET', `/v1/replication/replicate/list${qs}`)
  if (!res.ok) return { ops: [], availability: unavailable(res) }

  const raw = Array.isArray(res.data) ? res.data : ((res.data as any)?.replications ?? [])
  return { ops: (raw as any[]).map(toReplicationOp), availability: AVAILABLE }
}

export async function cancelReplication(connectionId: string, id: string): Promise<void> {
  const client = await getClient(connectionId)
  await client.cluster.replications.cancel(id)
}

export async function deleteReplication(connectionId: string, id: string): Promise<void> {
  const client = await getClient(connectionId)
  await client.cluster.replications.delete(id)
}

// ── Per-collection shard status ─────────────────────────────────────────────

function toShardStatus(raw: any): ShardStatus {
  return { name: raw?.name, status: raw?.status, vectorQueueSize: raw?.vectorQueueSize }
}

export async function getShards(
  connectionId: string,
  collection: string
): Promise<ShardStatus[]> {
  const client = await getClient(connectionId)
  const raw = await client.collections.get(collection).config.getShards()
  return (Array.isArray(raw) ? raw : []).map(toShardStatus)
}

/**
 * Flips shards between READY and READONLY. Weaviate drops a shard to READONLY
 * by itself when a node runs out of disk; setting it back to READY is the
 * manual step that unblocks writes once space has been freed.
 */
export async function updateShards(
  connectionId: string,
  collection: string,
  status: 'READY' | 'READONLY',
  shards?: string[]
): Promise<ShardStatus[]> {
  const client = await getClient(connectionId)
  const names = shards && shards.length ? shards : undefined
  const raw = await client.collections.get(collection).config.updateShards(status, names)
  return (Array.isArray(raw) ? raw : []).map(toShardStatus)
}
