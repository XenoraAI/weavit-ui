import { getClient } from './connectionManager'
import { restCall } from './rest'
import { normalizeForIpc } from '../util'
import type {
  CollectionConfig,
  CollectionSummary,
  InvertedIndexName,
  NamedVectorConfig,
  PropertyConfig,
  ReferenceConfig
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

/** Quantizer settings hang off the vector index config under a `type` tag. */
function extractQuantizer(indexConfig: any): NamedVectorConfig['quantizer'] {
  const q = indexConfig?.quantizer
  if (!q || typeof q !== 'object') return undefined
  const { type, ...rest } = q as Record<string, unknown>
  if (!type) return undefined
  return { type: String(type), config: rest }
}

/**
 * Every named vector space on the collection. Collections created before named
 * vectors existed report a single unnamed space, which we surface as `default`
 * so the UI has something to key on.
 */
function extractNamedVectors(raw: any): NamedVectorConfig[] {
  const vectorizers = raw?.vectorizers
  if (vectorizers && typeof vectorizers === 'object' && !Array.isArray(vectorizers)) {
    return Object.entries(vectorizers).map(([name, v]: [string, any]) => ({
      name,
      vectorizer: typeof v?.vectorizer === 'string' ? v.vectorizer : v?.vectorizer?.name,
      indexType: v?.indexType,
      indexConfig: v?.indexConfig ?? undefined,
      quantizer: extractQuantizer(v?.indexConfig),
      sourceProperties:
        v?.vectorizer?.config?.sourceProperties ?? v?.properties ?? undefined
    }))
  }
  const vectorizer = extractVectorizer(raw)
  if (!vectorizer && !raw?.vectorIndexConfig) return []
  return [
    {
      name: 'default',
      vectorizer,
      indexType: extractVectorIndexType(raw),
      indexConfig: raw?.vectorIndexConfig ?? undefined,
      quantizer: extractQuantizer(raw?.vectorIndexConfig)
    }
  ]
}

// Weaviate returns property dataType as either a string ("text") or an array
// (["text"]) depending on version — normalize to an array so the DTO contract
// (string[]) always holds for the renderer.
function toDataTypeArray(dt: unknown): string[] {
  if (Array.isArray(dt)) return dt.map(String)
  if (dt == null) return []
  return [String(dt)]
}

/** A dataType entry that names another collection is a cross-reference. */
function isReferenceDataType(dataType: string[]): boolean {
  return dataType.length > 0 && dataType.every((t) => /^[A-Z]/.test(t))
}

function mapProperties(raw: any): PropertyConfig[] {
  const props = Array.isArray(raw?.properties) ? raw.properties : []
  return props
    .filter((p: any) => !isReferenceDataType(toDataTypeArray(p.dataType)))
    .map((p: any) => ({
      name: p.name,
      dataType: toDataTypeArray(p.dataType),
      description: p.description,
      tokenization: p.tokenization,
      indexFilterable: p.indexFilterable,
      indexSearchable: p.indexSearchable,
      indexRangeFilters: p.indexRangeFilters,
      nestedProperties: Array.isArray(p.nestedProperties)
        ? mapProperties({ properties: p.nestedProperties })
        : undefined
    }))
}

function mapReferences(raw: any): ReferenceConfig[] {
  // v3 splits references out into their own array; older shapes leave them
  // among the properties, distinguishable by their capitalized dataType.
  const explicit = Array.isArray(raw?.references) ? raw.references : []
  if (explicit.length > 0) {
    return explicit.map((r: any) => ({
      name: r.name,
      targetCollections: toDataTypeArray(r.targetCollections ?? r.dataType),
      description: r.description
    }))
  }
  const props = Array.isArray(raw?.properties) ? raw.properties : []
  return props
    .filter((p: any) => isReferenceDataType(toDataTypeArray(p.dataType)))
    .map((p: any) => ({
      name: p.name,
      targetCollections: toDataTypeArray(p.dataType),
      description: p.description
    }))
}

function moduleName(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') return (v as any).name
  return undefined
}

/** Exported for testing: the shape mapping is where version drift bites. */
export function toConfig(raw: any): CollectionConfig {
  return {
    name: raw.name,
    description: raw.description,
    properties: mapProperties(raw),
    references: mapReferences(raw),
    vectorizer: extractVectorizer(raw),
    vectorIndexType: extractVectorIndexType(raw),
    namedVectors: extractNamedVectors(raw),
    generative: moduleName(raw?.generative),
    reranker: moduleName(raw?.reranker),
    multiTenancy: {
      enabled: Boolean(raw?.multiTenancy?.enabled),
      autoTenantCreation: raw?.multiTenancy?.autoTenantCreation,
      autoTenantActivation: raw?.multiTenancy?.autoTenantActivation
    },
    replication: raw?.replication
      ? { factor: raw.replication.factor, asyncEnabled: raw.replication.asyncEnabled }
      : undefined,
    sharding: raw?.sharding,
    invertedIndex: raw?.invertedIndex,
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

export async function collectionExists(connectionId: string, name: string): Promise<boolean> {
  const client = await getClient(connectionId)
  return client.collections.exists(name)
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

/**
 * Adds a cross-reference property. Reference targets are given as the
 * capitalized collection name(s) in `dataType`, which is what distinguishes a
 * reference from an ordinary property on the wire.
 */
export async function addReference(
  connectionId: string,
  name: string,
  reference: unknown
): Promise<void> {
  const client = await getClient(connectionId)
  await client.collections.get(name).config.addReference(reference as any)
}

/**
 * Adds one or more named vector spaces to an existing collection. Existing
 * named vectors are immutable, so only genuinely new ones may be supplied.
 */
export async function addVector(
  connectionId: string,
  name: string,
  vectors: unknown
): Promise<void> {
  const client = await getClient(connectionId)
  await client.collections.get(name).config.addVector(vectors as any)
}

/**
 * Drops one inverted index from a property. Destructive and not reversible
 * without a reindex, but it is the only way to reclaim the space an unused
 * filterable/searchable index occupies.
 */
export async function dropInvertedIndex(
  connectionId: string,
  name: string,
  property: string,
  index: InvertedIndexName
): Promise<void> {
  const client = await getClient(connectionId)
  await client.collections.get(name).config.dropInvertedIndex(property, index)
}

export async function deleteCollection(connectionId: string, name: string): Promise<void> {
  const client = await getClient(connectionId)
  await client.collections.delete(name)
}

// ── Schema export / import ──────────────────────────────────────────────────

/**
 * Exports one collection, or the whole schema when no name is given, in the
 * plain JSON form that `importSchema` accepts back.
 */
export async function exportSchema(connectionId: string, name?: string): Promise<unknown> {
  if (name) {
    const client = await getClient(connectionId)
    return normalizeForIpc(await client.collections.exportToJson(name))
  }
  const res = await restCall(connectionId, 'GET', '/v1/schema')
  if (!res.ok) throw restFail('Export schema', res)
  return normalizeForIpc(res.data)
}

/**
 * Recreates collections from an exported definition — either a single class
 * object or a `{ classes: [...] }` document. Collections that already exist are
 * skipped rather than overwritten, since a create is not an upgrade path.
 */
export async function importSchema(
  connectionId: string,
  definition: unknown
): Promise<{ created: string[] }> {
  const doc = definition as any
  const classes: any[] = Array.isArray(doc)
    ? doc
    : Array.isArray(doc?.classes)
      ? doc.classes
      : [doc]

  const client = await getClient(connectionId)
  const created: string[] = []
  for (const cls of classes) {
    const className = cls?.class ?? cls?.name
    if (!className) throw new Error('Schema entry is missing a class name')
    if (await client.collections.exists(className)) continue
    await client.collections.createFromJson(cls)
    created.push(className)
  }
  return { created }
}
