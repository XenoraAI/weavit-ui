import { getClient } from './connectionManager'
import { restCall } from './rest'
import { normalizeForIpc } from '../util'
import type {
  CollectionConfig,
  CollectionSummary,
  PropertyConfig,
  TenantInfo
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Collection config shapes vary a little across Weaviate versions, so we read
// fields defensively and always keep the raw object for the JSON view.

function extractVectorizer(raw: any): string | undefined {
  if (typeof raw?.vectorizer === 'string') return raw.vectorizer
  if (raw?.vectorizer?.name) return raw.vectorizer.name
  const vectorizers = raw?.vectorizers
  if (vectorizers && typeof vectorizers === 'object') {
    const first: any = Object.values(vectorizers)[0]
    if (first?.vectorizer?.name) return first.vectorizer.name
    if (typeof first?.vectorizer === 'string') return first.vectorizer
  }
  return undefined
}

function extractVectorIndexType(raw: any): string | undefined {
  if (raw?.vectorIndexType) return raw.vectorIndexType
  const vectorizers = raw?.vectorizers
  if (vectorizers && typeof vectorizers === 'object') {
    const first: any = Object.values(vectorizers)[0]
    if (first?.indexType) return first.indexType
  }
  return undefined
}

// Weaviate returns property dataType as either a string ("text") or an array
// (["text"]) depending on version — normalize to an array so the DTO contract
// (string[]) always holds for the renderer.
function toDataTypeArray(dt: unknown): string[] {
  if (Array.isArray(dt)) return dt.map(String)
  if (dt == null) return []
  return [String(dt)]
}

function mapProperties(raw: any): PropertyConfig[] {
  const props = Array.isArray(raw?.properties) ? raw.properties : []
  return props.map((p: any) => ({
    name: p.name,
    dataType: toDataTypeArray(p.dataType),
    description: p.description,
    tokenization: p.tokenization,
    indexFilterable: p.indexFilterable,
    indexSearchable: p.indexSearchable,
    nestedProperties: Array.isArray(p.nestedProperties)
      ? mapProperties({ properties: p.nestedProperties })
      : undefined
  }))
}

function toConfig(raw: any): CollectionConfig {
  return {
    name: raw.name,
    description: raw.description,
    properties: mapProperties(raw),
    vectorizer: extractVectorizer(raw),
    vectorIndexType: extractVectorIndexType(raw),
    multiTenancy: {
      enabled: Boolean(raw?.multiTenancy?.enabled),
      autoTenantCreation: raw?.multiTenancy?.autoTenantCreation
    },
    replication: raw?.replication ? { factor: raw.replication.factor } : undefined,
    sharding: raw?.sharding,
    raw: normalizeForIpc(raw)
  }
}

export async function listCollections(connectionId: string): Promise<CollectionSummary[]> {
  const client = await getClient(connectionId)
  const all = await client.collections.listAll()
  const arr = Array.isArray(all) ? all : Object.values(all)
  return arr
    .map((raw: any) => ({
      name: raw.name,
      description: raw.description,
      vectorizer: extractVectorizer(raw),
      propertyCount: Array.isArray(raw?.properties) ? raw.properties.length : 0,
      multiTenancyEnabled: Boolean(raw?.multiTenancy?.enabled)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getCollection(
  connectionId: string,
  name: string
): Promise<CollectionConfig> {
  const client = await getClient(connectionId)
  const collection = client.collections.get(name)
  const raw = await collection.config.get()
  return toConfig(raw)
}

export async function createCollection(
  connectionId: string,
  definition: unknown
): Promise<void> {
  // Use the classic REST schema endpoint — it accepts stable plain JSON and is
  // version-independent, unlike the typed client's builder-object shape.
  const res = await restCall(connectionId, 'POST', '/v1/schema', JSON.stringify(definition))
  if (!res.ok) throw restFail('Create collection', res)
}

function restFail(action: string, res: { status: number; data: unknown }): Error {
  const msg = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
  return new Error(`${action} failed (HTTP ${res.status}): ${msg}`)
}

/**
 * The class definition exactly as the REST schema endpoint returns it — this is
 * the shape PUT /v1/schema/{class} expects back, so the editor round-trips it
 * rather than the client's normalized config object.
 */
export async function getCollectionSchema(
  connectionId: string,
  name: string
): Promise<unknown> {
  const res = await restCall(connectionId, 'GET', `/v1/schema/${encodeURIComponent(name)}`)
  if (!res.ok) throw restFail('Read collection schema', res)
  return normalizeForIpc(res.data)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function deepMerge(
  current: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base = isPlainObject(current) ? { ...current } : {}
  for (const [key, value] of Object.entries(patch)) {
    base[key] = isPlainObject(value) ? deepMerge(base[key], value) : value
  }
  return base
}

/**
 * Updates the mutable parts of a collection definition. Weaviate's PUT replaces
 * the whole class, so by default we read the current definition and merge the
 * patch into it — sending a bare patch would blank out everything the user
 * didn't touch. Pass `replace` when the caller already holds a full class body
 * (the JSON editor), so deleting a key there actually deletes it.
 *
 * Weaviate rejects changes to immutable fields (class name, vectorizer, vector
 * index type, multi-tenancy enabled, existing property definitions); its error
 * is surfaced verbatim.
 */
export async function updateCollection(
  connectionId: string,
  name: string,
  patch: Record<string, unknown>,
  replace = false
): Promise<void> {
  const path = `/v1/schema/${encodeURIComponent(name)}`
  let body = patch
  if (!replace) {
    const current = await restCall(connectionId, 'GET', path)
    if (!current.ok) throw restFail('Read collection schema', current)
    body = deepMerge(current.data, patch)
  }
  const res = await restCall(connectionId, 'PUT', path, JSON.stringify(body))
  if (!res.ok) throw restFail('Update collection', res)
}

/**
 * Adds a property to an existing collection. Weaviate supports adding only —
 * properties cannot be renamed or removed once created.
 */
export async function addProperty(
  connectionId: string,
  name: string,
  property: unknown
): Promise<void> {
  const res = await restCall(
    connectionId,
    'POST',
    `/v1/schema/${encodeURIComponent(name)}/properties`,
    JSON.stringify(property)
  )
  if (!res.ok) throw restFail('Add property', res)
}

export async function deleteCollection(connectionId: string, name: string): Promise<void> {
  const client = await getClient(connectionId)
  await client.collections.delete(name)
}

export async function listTenants(
  connectionId: string,
  collectionName: string
): Promise<TenantInfo[]> {
  const client = await getClient(connectionId)
  const collection = client.collections.get(collectionName)
  try {
    const tenants = await collection.tenants.get()
    // tenants.get() returns a record keyed by tenant name in v3.
    const values = Array.isArray(tenants) ? tenants : Object.values(tenants ?? {})
    return values.map((t: any) => ({
      name: t.name,
      activityStatus: t.activityStatus ?? t.activityStatusInternal
    }))
  } catch {
    // Multi-tenancy not enabled on this collection.
    return []
  }
}
