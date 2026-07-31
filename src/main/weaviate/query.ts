import weaviate from 'weaviate-client'
import { getClient } from './connectionManager'
import { buildFilter } from './filters'
import { mapObject } from './data'
import { graphql, restCall } from './rest'
import type {
  AggregateResult,
  RawResponse,
  SearchRequest,
  SearchResult
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

const SEARCH_METADATA = [
  'distance',
  'certainty',
  'score',
  'explainScore',
  'creationTime',
  'updateTime'
]

export async function search(req: SearchRequest): Promise<SearchResult> {
  const client = await getClient(req.connectionId)
  let collection: any = client.collections.get(req.collection)
  if (req.tenant) collection = collection.withTenant(req.tenant)

  const filter = buildFilter(collection, (weaviate as any).Filters, req.filters)

  const opts: any = {
    limit: req.limit,
    includeVector: req.includeVector,
    returnMetadata: SEARCH_METADATA
  }
  if (filter) opts.filters = filter
  if (req.returnProperties && req.returnProperties.length) {
    opts.returnProperties = req.returnProperties
  }
  if (req.targetVector) opts.targetVector = req.targetVector

  let result: any
  switch (req.type) {
    case 'nearText':
      result = await collection.query.nearText(req.queryText ?? '', opts)
      break
    case 'bm25':
      result = await collection.query.bm25(req.queryText ?? '', opts)
      break
    case 'hybrid':
      result = await collection.query.hybrid(req.queryText ?? '', {
        ...opts,
        alpha: req.alpha ?? 0.5
      })
      break
    case 'nearVector': {
      const vector = JSON.parse(req.queryVector ?? '[]')
      result = await collection.query.nearVector(vector, opts)
      break
    }
    case 'fetch':
    default:
      result = await collection.query.fetchObjects(opts)
      break
  }

  return { objects: (result.objects ?? []).map(mapObject) }
}

export async function aggregate(
  connectionId: string,
  collectionName: string,
  tenant?: string
): Promise<AggregateResult> {
  const client = await getClient(connectionId)
  let collection: any = client.collections.get(collectionName)
  if (tenant) collection = collection.withTenant(tenant)
  const agg = await collection.aggregate.overAll()
  return { totalCount: agg?.totalCount ?? 0 }
}

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
