import weaviate, { type WeaviateClient } from 'weaviate-client'
import { buildFilter } from './filters'
import type {
  AggregateSearchSpec,
  ConsistencyLevel,
  ReferenceRequest,
  SearchRequest,
  SortSpec
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Everything that turns a SearchRequest from the renderer into the option bag
// the client expects. Shared by plain search and by generative (RAG) search,
// which take the same retrieval options plus a prompt.

/** Metadata we always ask for — cheap, and the UI surfaces all of it. */
export const SEARCH_METADATA = [
  'distance',
  'certainty',
  'score',
  'explainScore',
  'creationTime',
  'updateTime'
]

/**
 * What Weaviate accepts as a query vector: a plain vector, a multi-vector
 * (ColBERT-style, one vector per token), or one of those per named vector space.
 */
export type QueryVectorInput = number[] | number[][] | Record<string, number[] | number[][]>

const VECTOR_SHAPES =
  'e.g. [0.12, 0.98, …], [[0.12, …], [0.34, …]] for a multi-vector space, or {"title": [0.12, …]} to target named vectors'

function isVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/** One vector space's worth of input: 1-D, or 2-D for a multi-vector space. */
function parseOneVector(value: unknown, label: string): number[] | number[][] {
  if (isVector(value)) return value
  if (Array.isArray(value) && value.length > 0 && value.every((v) => Array.isArray(v))) {
    if (!value.every(isVector)) {
      throw new Error(`${label} must contain only finite numbers`)
    }
    return value as number[][]
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty JSON array of numbers — ${VECTOR_SHAPES}`)
  }
  throw new Error(`${label} must contain only finite numbers`)
}

// The renderer sends the vector as raw textarea contents, so anything can land
// here — blank, truncated JSON, a bare string. Fail with a message the user can
// act on instead of leaking a raw SyntaxError across IPC.
export function parseQueryVector(input: string | undefined): QueryVectorInput {
  const text = (input ?? '').trim()
  if (!text) {
    throw new Error('Query vector is required — paste a JSON array of numbers, e.g. [0.12, 0.98, …]')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Query vector is not valid JSON — expected an array of numbers, e.g. [0.12, 0.98, …]')
  }
  // An object keys one vector per named vector space.
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (entries.length === 0) {
      throw new Error(`Named query vectors must name at least one vector — ${VECTOR_SHAPES}`)
    }
    return Object.fromEntries(
      entries.map(([name, value]) => [name, parseOneVector(value, `Query vector "${name}"`)])
    )
  }
  return parseOneVector(parsed, 'Query vector')
}

/**
 * `true` asks for every vector on the object, which is expensive once a
 * collection has several named spaces; a list of names asks for just those.
 */
export function resolveIncludeVector(
  includeVector: boolean,
  names: string[] | undefined
): boolean | string[] {
  if (!includeVector) return false
  return names && names.length > 0 ? names : true
}

/** Narrow a collection handle to a tenant and/or consistency level. */
export function scopeCollection(
  client: WeaviateClient,
  name: string,
  tenant?: string,
  consistencyLevel?: ConsistencyLevel
): any {
  let collection: any = client.collections.get(name)
  if (tenant) collection = collection.withTenant(tenant)
  if (consistencyLevel) collection = collection.withConsistency(consistencyLevel)
  return collection
}

/** The `_`-prefixed names are the metadata pseudo-properties the UI offers. */
export function buildSort(collection: any, sort: SortSpec[] | undefined): any | undefined {
  const specs = (sort ?? []).filter((s) => s.property)
  if (specs.length === 0) return undefined
  let sorting: any
  for (const spec of specs) {
    const asc = spec.direction !== 'desc'
    const base = sorting ?? collection.sort
    switch (spec.property) {
      case '_id':
        sorting = base.byId(asc)
        break
      case '_creationTime':
        sorting = base.byCreationTime(asc)
        break
      case '_updateTime':
        sorting = base.byUpdateTime(asc)
        break
      default:
        sorting = base.byProperty(spec.property, asc)
    }
  }
  return sorting
}

const JOIN_METHOD: Record<string, string> = {
  sum: 'sum',
  average: 'average',
  minimum: 'minimum',
  manualWeights: 'manualWeights',
  relativeScore: 'relativeScore'
}

/**
 * Resolves the target vector: either a single named vector, or a multi-target
 * join across several. sum/average/minimum take a plain list of vector names;
 * manualWeights/relativeScore take a name -> weight map instead.
 */
export function buildTargetVector(collection: any, req: SearchRequest): any | undefined {
  const multi = req.multiTarget
  if (multi && multi.targets.length > 0) {
    const method = JOIN_METHOD[multi.join]
    if (!method) throw new Error(`Unknown multi-target join: ${multi.join}`)
    if (method === 'manualWeights' || method === 'relativeScore') {
      const weights: Record<string, number> = {}
      for (const target of multi.targets) weights[target] = multi.weights?.[target] ?? 1
      return collection.multiTargetVector[method](weights)
    }
    return collection.multiTargetVector[method](multi.targets)
  }
  return req.targetVector || undefined
}

export function buildReferences(refs: ReferenceRequest[] | undefined): any[] | undefined {
  const valid = (refs ?? []).filter((r) => r.property)
  if (valid.length === 0) return undefined
  return valid.map((r) => {
    const entry: any = { linkOn: r.property }
    if (r.targetCollection) entry.targetCollection = r.targetCollection
    if (r.returnProperties && r.returnProperties.length) {
      entry.returnProperties = r.returnProperties
    }
    return entry
  })
}

/** BM25/hybrid keyword fields, with optional `field^weight` boosts. */
export function buildQueryProperties(req: SearchRequest): string[] | undefined {
  const props = (req.queryProperties ?? []).filter((p) => p.property)
  if (props.length === 0) return undefined
  return props.map((p) =>
    p.weight != null && p.weight !== 1 ? `${p.property}^${p.weight}` : p.property
  )
}

function buildMove(move: SearchRequest['moveTo']): any | undefined {
  if (!move) return undefined
  const concepts = move.concepts.filter(Boolean)
  const objects = (move.objects ?? []).filter(Boolean)
  if (concepts.length === 0 && objects.length === 0) return undefined
  const out: any = { force: move.force }
  if (concepts.length) out.concepts = concepts
  if (objects.length) out.objects = objects
  return out
}

/** Search kinds that carry a vector component, and so accept near-* tuning. */
const VECTOR_TYPES = new Set(['nearText', 'nearVector', 'nearObject', 'nearImage', 'nearMedia'])

/**
 * Assemble the option bag common to every search kind. Only the options that
 * apply to `req.type` are included — Weaviate rejects, for instance, a
 * `distance` on a BM25 query rather than ignoring it.
 */
export function buildSearchOptions(collection: any, req: SearchRequest): any {
  const opts: any = {
    limit: req.limit,
    includeVector: resolveIncludeVector(req.includeVector, req.vectorNames),
    returnMetadata: SEARCH_METADATA
  }

  const filter = buildFilter(collection, (weaviate as any).Filters, req.filters)
  if (filter) opts.filters = filter

  if (req.offset != null && req.offset > 0) opts.offset = req.offset
  if (req.autoLimit != null && req.autoLimit > 0) opts.autoLimit = req.autoLimit

  if (req.returnProperties && req.returnProperties.length) {
    opts.returnProperties = req.returnProperties
  }
  const references = buildReferences(req.returnReferences)
  if (references) opts.returnReferences = references

  // Sorting is only legal on an unranked fetch — a scored search already has an
  // order, and Weaviate errors if you try to impose another.
  if (req.type === 'fetch') {
    const sorting = buildSort(collection, req.sort)
    if (sorting) opts.sort = sorting
  }

  if (req.type !== 'fetch') {
    const targetVector = buildTargetVector(collection, req)
    if (targetVector) opts.targetVector = targetVector
  }

  if (VECTOR_TYPES.has(req.type)) {
    if (req.distance != null) opts.distance = req.distance
    else if (req.certainty != null) opts.certainty = req.certainty

    // MMR is the only diversity algorithm the server implements today, so the
    // UI offers its two knobs and this names the algorithm.
    if (req.diversity) {
      const diversity: any = { type: 'mmr' }
      if (req.diversity.limit != null) diversity.limit = req.diversity.limit
      if (req.diversity.balance != null) diversity.balance = req.diversity.balance
      opts.diversity = diversity
    }
  }

  if (req.type === 'nearText') {
    const moveTo = buildMove(req.moveTo)
    const moveAway = buildMove(req.moveAway)
    if (moveTo) opts.moveTo = moveTo
    if (moveAway) opts.moveAway = moveAway
  }

  if (req.type === 'bm25' || req.type === 'hybrid') {
    const queryProperties = buildQueryProperties(req)
    if (queryProperties) opts.queryProperties = queryProperties
    if (req.bm25Operator) {
      opts.bm25Operator =
        req.bm25Operator.operator === 'and'
          ? { operator: 'and' }
          : { operator: 'or', minimumMatch: req.bm25Operator.minimumMatch ?? 1 }
    }
  }

  if (req.type === 'hybrid') {
    opts.alpha = req.alpha ?? 0.5
    if (req.fusionType) opts.fusionType = req.fusionType
    if (req.maxVectorDistance != null) opts.maxVectorDistance = req.maxVectorDistance
    // Supplying a vector replaces the one the server would compute from the
    // query text — the way to bring your own embedding to a hybrid search.
    if (req.queryVector?.trim()) opts.vector = parseQueryVector(req.queryVector)
  }

  if (req.rerank?.property) {
    opts.rerank = { property: req.rerank.property, query: req.rerank.query || req.queryText || '' }
  }

  if (req.groupBy?.property) {
    opts.groupBy = {
      property: req.groupBy.property,
      numberOfGroups: req.groupBy.numberOfGroups,
      objectsPerGroup: req.groupBy.objectsPerGroup
    }
  }

  return opts
}

/** Base64 payload for nearImage/nearMedia; the client accepts it as a string. */
export function mediaPayload(media: string | undefined): string {
  const raw = (media ?? '').trim()
  if (!raw) throw new Error('Provide an image or media file to search with')
  // Tolerate a pasted data: URL by stripping the prefix.
  const comma = raw.indexOf(',')
  return raw.startsWith('data:') && comma > -1 ? raw.slice(comma + 1) : raw
}

/** Per-call options, as opposed to per-query ones — currently just the signal. */
export function callOptions(signal: AbortSignal | undefined): any | undefined {
  return signal ? { abortSignal: signal } : undefined
}

/**
 * Dispatch a search against either `collection.query` or `collection.generate`.
 * The generate namespace takes the same arguments with a prompt spliced in
 * after the query term, so one dispatcher covers both. Every query method takes
 * the call options last, which is how a cancel reaches an in-flight request.
 */
export async function dispatchSearch(
  collection: any,
  req: SearchRequest,
  opts: any,
  generateArg?: any,
  callOpts?: any
): Promise<any> {
  const ns = generateArg ? collection.generate : collection.query
  const call = (method: string, ...leading: unknown[]): Promise<any> => {
    const args = generateArg ? [...leading, generateArg, opts] : [...leading, opts]
    // Only append when there is something to say — the client reads the trailing
    // argument positionally, so a bare undefined is noise on every call.
    if (callOpts) args.push(callOpts)
    return ns[method](...args)
  }

  switch (req.type) {
    case 'nearText':
      return call('nearText', req.queryText ?? '')
    case 'bm25':
      return call('bm25', req.queryText ?? '')
    case 'hybrid':
      return call('hybrid', req.queryText ?? '')
    case 'nearVector':
      return call('nearVector', parseQueryVector(req.queryVector))
    case 'nearObject': {
      const id = (req.queryObjectId ?? '').trim()
      if (!id) throw new Error('Near object search needs the UUID of an existing object')
      return call('nearObject', id)
    }
    case 'nearImage':
      return call('nearImage', mediaPayload(req.queryMedia))
    case 'nearMedia':
      return call('nearMedia', mediaPayload(req.queryMedia), req.mediaKind ?? 'image')
    case 'fetch':
    default:
      return call('fetchObjects')
  }
}

// ── Aggregation scoped to a search ──────────────────────────────────────────

/**
 * Weaviate needs an explicit bound on how many matches feed a scoped
 * aggregation. `certainty`/`distance` count as one; when neither is given we
 * supply this rather than let the server reject the request.
 */
export const DEFAULT_AGGREGATE_OBJECT_LIMIT = 100

/**
 * The aggregate API takes a smaller option bag than a search does: no paging,
 * no sorting, no rerank. `base` carries what the caller already worked out
 * (filters, returnMetrics, groupBy) and this adds the search's own knobs.
 */
export function buildAggregateOptions(spec: AggregateSearchSpec, base: any = {}): any {
  const opts: any = { ...base }

  if (spec.type !== 'hybrid') {
    if (spec.distance != null) opts.distance = spec.distance
    else if (spec.certainty != null) opts.certainty = spec.certainty
  }
  if (spec.objectLimit != null && spec.objectLimit > 0) {
    opts.objectLimit = spec.objectLimit
  } else if (opts.distance == null && opts.certainty == null) {
    opts.objectLimit = DEFAULT_AGGREGATE_OBJECT_LIMIT
  }

  if (spec.targetVector) opts.targetVector = spec.targetVector

  if (spec.type === 'hybrid') {
    opts.alpha = spec.alpha ?? 0.5
    if (spec.maxVectorDistance != null) opts.maxVectorDistance = spec.maxVectorDistance
    const queryProperties = (spec.queryProperties ?? [])
      .filter((p) => p.property)
      .map((p) => (p.weight != null && p.weight !== 1 ? `${p.property}^${p.weight}` : p.property))
    if (queryProperties.length) opts.queryProperties = queryProperties
  }

  return opts
}

/**
 * Runs the aggregation against `collection.aggregate` — or its `groupBy`
 * namespace, which takes the same arguments and returns one result per group.
 * Note the aggregate API has no `bm25` or `nearMedia`; nearImage is the only
 * media search it offers.
 */
export async function dispatchAggregate(
  collection: any,
  spec: AggregateSearchSpec,
  opts: any,
  grouped = false
): Promise<any> {
  const ns = grouped ? collection.aggregate.groupBy : collection.aggregate

  switch (spec.type) {
    case 'nearText': {
      const text = (spec.queryText ?? '').trim()
      if (!text) throw new Error('Near text aggregation needs a query')
      return ns.nearText(text, opts)
    }
    case 'hybrid': {
      const text = (spec.queryText ?? '').trim()
      if (!text) throw new Error('Hybrid aggregation needs a query')
      return ns.hybrid(text, opts)
    }
    case 'nearVector':
      return ns.nearVector(parseQueryVector(spec.queryVector), opts)
    case 'nearObject': {
      const id = (spec.queryObjectId ?? '').trim()
      if (!id) throw new Error('Near object aggregation needs the UUID of an existing object')
      return ns.nearObject(id, opts)
    }
    case 'nearImage':
      return ns.nearImage(mediaPayload(spec.queryMedia), opts)
    default:
      throw new Error(`Unsupported aggregation search: ${(spec as AggregateSearchSpec).type}`)
  }
}
