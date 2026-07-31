import weaviate from 'weaviate-client'
import { getClient } from './connectionManager'
import { buildFilter } from './filters'
import { normalizeForIpc } from '../util'
import type {
  DeleteObjectRequest,
  FetchObjectsRequest,
  FetchObjectsResult,
  FilterCondition,
  InsertObjectRequest,
  UpdateObjectRequest,
  WeaviateObject
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

function scoped(collection: any, tenant?: string): any {
  return tenant ? collection.withTenant(tenant) : collection
}

export function mapObject(o: any): WeaviateObject {
  return normalizeForIpc<WeaviateObject>({
    uuid: o.uuid ?? o.id,
    properties: o.properties ?? {},
    metadata: o.metadata ?? undefined,
    vectors: o.vectors ?? undefined,
    references: o.references ?? undefined
  })
}

const OBJECT_METADATA = ['creationTime', 'updateTime'] as const

export async function fetchObjects(req: FetchObjectsRequest): Promise<FetchObjectsResult> {
  const client = await getClient(req.connectionId)
  const collection = scoped(client.collections.get(req.collection), req.tenant)

  const result = await collection.query.fetchObjects({
    limit: req.limit,
    offset: req.offset,
    includeVector: req.includeVector,
    returnMetadata: OBJECT_METADATA as unknown as string[]
  })

  let totalCount: number | undefined
  try {
    const agg = await collection.aggregate.overAll()
    totalCount = agg?.totalCount
  } catch {
    /* aggregate may be unavailable; ignore */
  }

  return { objects: (result.objects ?? []).map(mapObject), totalCount }
}

export async function getObject(
  connectionId: string,
  collectionName: string,
  id: string,
  tenant?: string
): Promise<WeaviateObject | null> {
  const client = await getClient(connectionId)
  const collection = scoped(client.collections.get(collectionName), tenant)
  const obj = await collection.query.fetchObjectById(id, {
    includeVector: true,
    returnMetadata: OBJECT_METADATA as unknown as string[]
  })
  return obj ? mapObject(obj) : null
}

export async function insertObject(req: InsertObjectRequest): Promise<{ uuid: string }> {
  const client = await getClient(req.connectionId)
  const collection = scoped(client.collections.get(req.collection), req.tenant)
  const payload: any = { properties: req.properties }
  if (req.id) payload.id = req.id
  if (req.vector && req.vector.length) payload.vectors = req.vector
  const uuid = await collection.data.insert(payload)
  return { uuid: typeof uuid === 'string' ? uuid : uuid?.uuid ?? String(uuid) }
}

export async function updateObject(req: UpdateObjectRequest): Promise<void> {
  const client = await getClient(req.connectionId)
  const collection = scoped(client.collections.get(req.collection), req.tenant)
  const payload = { id: req.id, properties: req.properties }
  if (req.merge) {
    await collection.data.update(payload)
  } else {
    await collection.data.replace(payload)
  }
}

export async function deleteObject(req: DeleteObjectRequest): Promise<void> {
  const client = await getClient(req.connectionId)
  const collection = scoped(client.collections.get(req.collection), req.tenant)
  await collection.data.deleteById(req.id)
}

export async function deleteMany(
  connectionId: string,
  collectionName: string,
  filters: FilterCondition[],
  tenant?: string
): Promise<{ matches: number }> {
  const client = await getClient(connectionId)
  const collection = scoped(client.collections.get(collectionName), tenant)
  const filter = buildFilter(collection, (weaviate as any).Filters, filters)
  if (!filter) throw new Error('Refusing to delete without at least one filter condition')
  const res = await collection.data.deleteMany(filter)
  return { matches: res?.matches ?? 0 }
}
