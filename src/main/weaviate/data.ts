import weaviate from 'weaviate-client'
import { getClient } from './connectionManager'
import { buildFilter } from './filters'
import { buildReferences, buildSort, resolveIncludeVector, scopeCollection } from './searchOptions'
import { normalizeForIpc } from '../util'
import type {
  DeleteObjectRequest,
  ExportObjectsRequest,
  FetchObjectsRequest,
  FetchObjectsResult,
  FilterNode,
  ImportObjectsRequest,
  ImportResult,
  InsertObjectRequest,
  ReferenceMutationRequest,
  UpdateObjectRequest,
  WeaviateObject
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

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

/** Weaviate's cursor API is fetch-only: it can't be combined with a sort or a
 *  filter. When either is in play we fall back to offset paging. */
function cursorUsable(req: FetchObjectsRequest): boolean {
  const hasSort = (req.sort ?? []).some((s) => s.property)
  const hasFilter = (req.filters ?? []).length > 0
  return !hasSort && !hasFilter
}

export async function fetchObjects(req: FetchObjectsRequest): Promise<FetchObjectsResult> {
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant, req.consistencyLevel)

  const opts: any = {
    limit: req.limit,
    includeVector: resolveIncludeVector(req.includeVector, req.vectorNames),
    returnMetadata: OBJECT_METADATA as unknown as string[]
  }

  const useCursor = req.after != null && cursorUsable(req)
  if (useCursor) opts.after = req.after
  else if (req.offset) opts.offset = req.offset

  const sorting = buildSort(collection, req.sort)
  if (sorting) opts.sort = sorting

  const filter = buildFilter(collection, (weaviate as any).Filters, req.filters)
  if (filter) opts.filters = filter

  const references = buildReferences(req.returnReferences)
  if (references) opts.returnReferences = references

  const result = await collection.query.fetchObjects(opts)
  const objects = (result.objects ?? []).map(mapObject)

  let totalCount: number | undefined
  let totalCountError: string | undefined
  try {
    const agg = await collection.aggregate.overAll(filter ? { filters: filter } : undefined)
    totalCount = agg?.totalCount
  } catch (e) {
    // Aggregation is unavailable on some deployments (and on offloaded
    // tenants). Say so rather than silently dropping the row count.
    totalCountError = e instanceof Error ? e.message : String(e)
  }

  // A short page means we reached the end, so there is nothing to page past.
  const nextCursor =
    cursorUsable(req) && objects.length === req.limit
      ? objects[objects.length - 1]?.uuid
      : undefined

  return { objects, totalCount, totalCountError, nextCursor }
}

export async function getObject(
  connectionId: string,
  collectionName: string,
  id: string,
  tenant?: string
): Promise<WeaviateObject | null> {
  const client = await getClient(connectionId)
  const collection = scopeCollection(client, collectionName, tenant)
  const obj = await collection.query.fetchObjectById(id, {
    includeVector: true,
    returnMetadata: OBJECT_METADATA as unknown as string[]
  })
  return obj ? mapObject(obj) : null
}

export async function objectExists(
  connectionId: string,
  collectionName: string,
  id: string,
  tenant?: string
): Promise<boolean> {
  const client = await getClient(connectionId)
  const collection = scopeCollection(client, collectionName, tenant)
  return collection.data.exists(id)
}

/** Cross-references travel as `{ prop: [uuid, …] }` and become beacons. */
function referencePayload(refs: Record<string, string[]> | undefined): any | undefined {
  if (!refs) return undefined
  const entries = Object.entries(refs).filter(([, ids]) => ids && ids.length > 0)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

export async function insertObject(req: InsertObjectRequest): Promise<{ uuid: string }> {
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant, req.consistencyLevel)
  const payload: any = { properties: req.properties }
  if (req.id) payload.id = req.id
  // Named vectors win when both are supplied — they are the more specific form.
  if (req.vectors && Object.keys(req.vectors).length) payload.vectors = req.vectors
  else if (req.vector && req.vector.length) payload.vectors = req.vector
  const references = referencePayload(req.references)
  if (references) payload.references = references
  const uuid = await collection.data.insert(payload)
  return { uuid: typeof uuid === 'string' ? uuid : uuid?.uuid ?? String(uuid) }
}

export async function updateObject(req: UpdateObjectRequest): Promise<void> {
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant, req.consistencyLevel)
  const payload: any = { id: req.id, properties: req.properties }
  if (req.vectors && Object.keys(req.vectors).length) payload.vectors = req.vectors
  if (req.merge) {
    await collection.data.update(payload)
  } else {
    await collection.data.replace(payload)
  }
}

export async function deleteObject(req: DeleteObjectRequest): Promise<void> {
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant, req.consistencyLevel)
  await collection.data.deleteById(req.id)
}

/**
 * Filtered bulk delete. `dryRun` asks Weaviate how many objects the filter
 * matches without removing anything, which is what the confirmation step uses.
 */
export async function deleteMany(
  connectionId: string,
  collectionName: string,
  filters: FilterNode[],
  tenant?: string,
  dryRun = false
): Promise<{ matches: number; deleted?: number; failed?: number }> {
  const client = await getClient(connectionId)
  const collection = scopeCollection(client, collectionName, tenant)
  const filter = buildFilter(collection, (weaviate as any).Filters, filters)
  if (!filter) throw new Error('Refusing to delete without at least one filter condition')
  const res = await collection.data.deleteMany(filter, { dryRun })
  return {
    matches: res?.matches ?? 0,
    deleted: dryRun ? undefined : res?.successful,
    failed: dryRun ? undefined : res?.failed
  }
}

// ── Cross-references ────────────────────────────────────────────────────────

function refArgs(req: ReferenceMutationRequest): any {
  const uuids = req.to.map((u) => u.trim()).filter(Boolean)
  if (uuids.length === 0) throw new Error('Provide at least one target UUID')
  return {
    fromUuid: req.fromUuid,
    fromProperty: req.fromProperty,
    to: req.targetCollection ? { targetCollection: req.targetCollection, uuids } : uuids
  }
}

export async function referenceAdd(req: ReferenceMutationRequest): Promise<void> {
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant)
  await collection.data.referenceAdd(refArgs(req))
}

/** Replaces every target of the property — passing an empty list is a delete. */
export async function referenceReplace(req: ReferenceMutationRequest): Promise<void> {
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant)
  await collection.data.referenceReplace(refArgs(req))
}

export async function referenceDelete(req: ReferenceMutationRequest): Promise<void> {
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant)
  await collection.data.referenceDelete(refArgs(req))
}

// ── Bulk import / export ────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 100
const MAX_BATCH_SIZE = 1000

/**
 * Inserts objects in batches via `insertMany`, which reports per-row failures
 * rather than aborting the whole run. Errors are collected with their index in
 * the caller's original array so the UI can point at the offending row.
 */
export async function importObjects(req: ImportObjectsRequest): Promise<ImportResult> {
  if (req.objects.length === 0) throw new Error('Nothing to import')
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant)

  const batchSize = Math.min(Math.max(req.batchSize ?? DEFAULT_BATCH_SIZE, 1), MAX_BATCH_SIZE)
  const result: ImportResult = { inserted: 0, failed: 0, errors: [], uuids: [] }

  for (let start = 0; start < req.objects.length; start += batchSize) {
    const slice = req.objects.slice(start, start + batchSize)
    const payload = slice.map((o) => {
      const entry: any = { properties: o.properties }
      if (o.id) entry.id = o.id
      if (o.vectors && Object.keys(o.vectors).length) entry.vectors = o.vectors
      const references = referencePayload(o.references)
      if (references) entry.references = references
      return entry
    })

    let batch: any
    try {
      batch = await collection.data.insertMany(payload)
    } catch (e) {
      // A whole-batch failure (auth, schema, transport) — attribute it to every
      // row in the batch so the totals still add up.
      const message = e instanceof Error ? e.message : String(e)
      for (let i = 0; i < slice.length; i++) {
        result.failed++
        result.errors.push({ index: start + i, message })
      }
      continue
    }

    const errors = batch?.errors ?? {}
    const uuids = batch?.uuids ?? {}
    for (let i = 0; i < slice.length; i++) {
      const err = errors[i]
      if (err) {
        result.failed++
        result.errors.push({ index: start + i, message: err.message ?? 'Insert failed' })
      } else {
        result.inserted++
        if (uuids[i]) result.uuids.push(uuids[i])
      }
    }
  }

  return result
}

/**
 * Reads up to `limit` objects for export. Uses the cursor iterator so a large
 * export doesn't hit the offset-depth wall, and stops at the cap so a stray
 * click can't stream an entire production collection into the renderer.
 */
export async function exportObjects(req: ExportObjectsRequest): Promise<WeaviateObject[]> {
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant)
  const filter = buildFilter(collection, (weaviate as any).Filters, req.filters)

  const includeVector = resolveIncludeVector(req.includeVector, req.vectorNames)
  // Weaviate resolves a cross-reference only when asked, so an export that
  // doesn't name them comes back with the references silently missing.
  const references = buildReferences(req.returnReferences)

  const out: WeaviateObject[] = []

  if (filter) {
    // The iterator can't carry a filter, so paginate the filtered query instead.
    const pageSize = Math.min(req.limit, 200)
    let offset = 0
    while (out.length < req.limit) {
      const page = await collection.query.fetchObjects({
        limit: Math.min(pageSize, req.limit - out.length),
        offset,
        filters: filter,
        includeVector,
        returnMetadata: OBJECT_METADATA as unknown as string[],
        ...(references ? { returnReferences: references } : {})
      })
      const objects = page.objects ?? []
      if (objects.length === 0) break
      out.push(...objects.map(mapObject))
      offset += objects.length
    }
    return out
  }

  for await (const obj of collection.iterator({
    includeVector,
    ...(references ? { returnReferences: references } : {})
  })) {
    out.push(mapObject(obj))
    if (out.length >= req.limit) break
  }
  return out
}
