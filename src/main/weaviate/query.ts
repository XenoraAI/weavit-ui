import weaviate from 'weaviate-client'
import { getClient } from './connectionManager'
import { buildFilter, referenceFilterUnsupported } from './filters'
import { mapObject } from './data'
import { graphql, restCall } from './rest'
import {
  buildAggregateOptions,
  buildSearchOptions,
  callOptions,
  dispatchAggregate,
  dispatchSearch,
  parseQueryVector,
  scopeCollection
} from './searchOptions'
import type {
  AggregateResult,
  CollectionStatsRequest,
  CollectionStatsResult,
  PropertyMetricKind,
  PropertyStats,
  RawResponse,
  SearchGroup,
  SearchRequest,
  SearchResult,
  StatsGroup
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Re-exported so existing callers and tests keep their import path.
export { parseQueryVector }

export function mapGroups(raw: any): SearchGroup[] | undefined {
  const groups = raw?.groups
  if (!groups) return undefined
  const values = Array.isArray(groups) ? groups : Object.values(groups)
  return values.map((g: any) => ({
    name: String(g?.name ?? ''),
    numberOfObjects: g?.numberOfObjects ?? (g?.objects?.length ?? 0),
    minDistance: g?.minDistance,
    maxDistance: g?.maxDistance,
    objects: (g?.objects ?? []).map(mapObject)
  }))
}

export async function search(req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant, req.consistencyLevel)
  const opts = buildSearchOptions(collection, req)

  const started = Date.now()
  const result = await dispatchSearch(collection, req, opts, undefined, callOptions(signal))
  const took = Date.now() - started

  return {
    objects: (result.objects ?? []).map(mapObject),
    groups: mapGroups(result),
    took
  }
}

export async function aggregate(
  connectionId: string,
  collectionName: string,
  tenant?: string
): Promise<AggregateResult> {
  const client = await getClient(connectionId)
  const collection = scopeCollection(client, collectionName, tenant)
  const agg = await collection.aggregate.overAll()
  return { totalCount: agg?.totalCount ?? 0 }
}

// ── Collection statistics ───────────────────────────────────────────────────

/** Which aggregation family a property's dataType belongs to, if any. */
export function metricKindFor(dataType: string[]): PropertyMetricKind | undefined {
  const base = (dataType[0] ?? '').replace(/\[\]$/, '')
  switch (base) {
    case 'text':
    case 'string':
      return 'text'
    case 'int':
      return 'integer'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'date':
      return 'date'
    default:
      // uuid, blob, geoCoordinates, phoneNumber, object and cross-references
      // have no meaningful aggregation in Weaviate.
      return undefined
  }
}

function metricFor(collection: any, property: string, kind: PropertyMetricKind): any {
  const m = collection.metrics.aggregate(property)
  switch (kind) {
    case 'text':
      return m.text(['count', 'topOccurrencesOccurs', 'topOccurrencesValue'])
    case 'integer':
      return m.integer()
    case 'number':
      return m.number()
    case 'boolean':
      return m.boolean()
    case 'date':
      // `mean` and `sum` are undefined for dates, so the client omits them.
      return m.date()
  }
}

function toPropertyStats(
  property: string,
  kind: PropertyMetricKind,
  raw: any
): PropertyStats {
  return {
    property,
    kind,
    count: raw?.count,
    minimum: raw?.minimum,
    maximum: raw?.maximum,
    mean: raw?.mean,
    median: raw?.median,
    mode: raw?.mode,
    sum: raw?.sum,
    totalTrue: raw?.totalTrue,
    totalFalse: raw?.totalFalse,
    percentageTrue: raw?.percentageTrue,
    percentageFalse: raw?.percentageFalse,
    topOccurrences: raw?.topOccurrences
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Property-level aggregation for the stats view. We try one batched request
 * first because that is a single round-trip; if the server rejects the batch
 * (one bad property poisons the whole call) we retry property by property so a
 * single unsupported field doesn't blank out the rest.
 *
 * With `req.search` set, every one of those requests aggregates over the
 * objects that search matches rather than the whole collection.
 */
export async function collectionStats(
  req: CollectionStatsRequest
): Promise<CollectionStatsResult> {
  const client = await getClient(req.connectionId)
  const collection = scopeCollection(client, req.collection, req.tenant)
  const config = await collection.config.get()

  const filter = buildFilter(collection, (weaviate as any).Filters, req.filters)
  const baseOpts: any = {}
  if (filter) baseOpts.filters = filter

  const search = req.search
  const runAggregate = (opts: any): Promise<any> =>
    search
      ? dispatchAggregate(collection, search, buildAggregateOptions(search, opts))
      : collection.aggregate.overAll(opts)
  const runGroupBy = (opts: any): Promise<any> =>
    search
      ? dispatchAggregate(collection, search, buildAggregateOptions(search, opts), true)
      : collection.aggregate.groupBy.overAll(opts)

  const wanted = new Set(req.properties ?? [])
  const candidates: { property: string; kind: PropertyMetricKind }[] = []
  const skipped: { property: string; reason: string }[] = []

  for (const prop of config?.properties ?? []) {
    const name = prop?.name
    if (!name) continue
    if (wanted.size > 0 && !wanted.has(name)) continue
    const dataType = Array.isArray(prop.dataType) ? prop.dataType.map(String) : [String(prop.dataType)]
    const kind = metricKindFor(dataType)
    if (!kind) {
      skipped.push({ property: name, reason: `${dataType.join(', ')} is not aggregatable` })
      continue
    }
    candidates.push({ property: name, kind })
  }

  const properties: PropertyStats[] = []
  let totalCount = 0

  if (candidates.length === 0) {
    const agg = await runAggregate(baseOpts)
    totalCount = agg?.totalCount ?? 0
  } else {
    const returnMetrics = candidates.map((c) => metricFor(collection, c.property, c.kind))
    try {
      const agg = await runAggregate({ ...baseOpts, returnMetrics })
      totalCount = agg?.totalCount ?? 0
      for (const c of candidates) {
        properties.push(toPropertyStats(c.property, c.kind, agg?.properties?.[c.property]))
      }
    } catch (e) {
      // A filter the server won't accept fails every property identically —
      // retrying one by one would just repeat the same message N times.
      const unsupported = referenceFilterUnsupported(errText(e))
      if (unsupported) throw new Error(unsupported)

      // Otherwise fall back to one request per property so we can name the offender.
      const agg = await runAggregate(baseOpts)
      totalCount = agg?.totalCount ?? 0
      const settled = await Promise.all(
        candidates.map(async (c) => {
          try {
            const one = await runAggregate({
              ...baseOpts,
              returnMetrics: [metricFor(collection, c.property, c.kind)]
            })
            return { c, raw: one?.properties?.[c.property] }
          } catch (e) {
            return { c, error: errText(e) }
          }
        })
      )
      for (const s of settled) {
        if ('error' in s && s.error) skipped.push({ property: s.c.property, reason: s.error })
        else properties.push(toPropertyStats(s.c.property, s.c.kind, (s as any).raw))
      }
    }
  }

  let groups: StatsGroup[] | undefined
  if (req.groupBy) {
    try {
      const raw = await runGroupBy({
        ...baseOpts,
        groupBy: { property: req.groupBy, limit: 50 }
      })
      groups = (Array.isArray(raw) ? raw : []).map((g: any) => ({
        value: String(g?.groupedBy?.value ?? ''),
        count: g?.totalCount ?? 0
      }))
    } catch (e) {
      skipped.push({ property: req.groupBy, reason: `group-by failed: ${errText(e)}` })
    }
  }

  return { totalCount, properties, groups, skipped }
}

// ── Raw consoles ────────────────────────────────────────────────────────────

export async function rawGraphQL(connectionId: string, query: string): Promise<RawResponse> {
  const res = await graphql(connectionId, query)
  return { status: res.status, ok: res.ok, data: res.data }
}

export async function rawRest(
  connectionId: string,
  method: string,
  path: string,
  body?: string
): Promise<RawResponse> {
  const res = await restCall(connectionId, method, path, body)
  return { status: res.status, ok: res.ok, data: res.data }
}
