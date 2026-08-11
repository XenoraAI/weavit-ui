import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_AGGREGATE_OBJECT_LIMIT,
  buildAggregateOptions,
  buildQueryProperties,
  buildReferences,
  buildSearchOptions,
  buildSort,
  buildTargetVector,
  dispatchAggregate,
  dispatchSearch,
  parseQueryVector,
  resolveIncludeVector
} from './searchOptions'
import type { SearchRequest } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

function fakeCollection() {
  const sortChain = {
    calls: [] as { method: string; args: unknown[] }[],
    byProperty(...args: unknown[]) {
      this.calls.push({ method: 'byProperty', args })
      return this
    },
    byId(...args: unknown[]) {
      this.calls.push({ method: 'byId', args })
      return this
    },
    byCreationTime(...args: unknown[]) {
      this.calls.push({ method: 'byCreationTime', args })
      return this
    },
    byUpdateTime(...args: unknown[]) {
      this.calls.push({ method: 'byUpdateTime', args })
      return this
    }
  }

  return {
    sort: sortChain,
    filter: {
      byProperty: () => ({ equal: (v: unknown) => ({ eq: v }) })
    },
    multiTargetVector: {
      sum: (targets: string[]) => ({ join: 'sum', targets }),
      average: (targets: string[]) => ({ join: 'average', targets }),
      minimum: (targets: string[]) => ({ join: 'minimum', targets }),
      manualWeights: (weights: Record<string, number>) => ({ join: 'manualWeights', weights }),
      relativeScore: (weights: Record<string, number>) => ({ join: 'relativeScore', weights })
    }
  } as any
}

function req(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    connectionId: 'c',
    collection: 'Product',
    type: 'fetch',
    limit: 10,
    includeVector: false,
    filters: [],
    ...overrides
  }
}

describe('parseQueryVector', () => {
  it('parses a JSON array of numbers', () => {
    expect(parseQueryVector('[0.1, -0.2, 3]')).toEqual([0.1, -0.2, 3])
  })

  it('rejects blank input instead of throwing a SyntaxError', () => {
    expect(() => parseQueryVector('')).toThrow(/Query vector is required/)
    expect(() => parseQueryVector(undefined)).toThrow(/Query vector is required/)
  })

  it('rejects malformed JSON with a readable message', () => {
    expect(() => parseQueryVector('[0.1, 0.2')).toThrow(/not valid JSON/)
  })

  it('accepts a multi-vector (2-D) input', () => {
    expect(parseQueryVector('[[0.1, 0.2], [0.3, 0.4]]')).toEqual([
      [0.1, 0.2],
      [0.3, 0.4]
    ])
  })

  it('accepts an object of named vectors, single- and multi-vector alike', () => {
    expect(parseQueryVector('{"title": [0.1, 0.2], "body": [[0.3], [0.4]]}')).toEqual({
      title: [0.1, 0.2],
      body: [[0.3], [0.4]]
    })
  })

  it('names the offending vector in a named-vector input', () => {
    expect(() => parseQueryVector('{"title": [0.1, "x"]}')).toThrow(
      /Query vector "title" must contain only finite numbers/
    )
  })

  it('rejects an empty named-vector object', () => {
    expect(() => parseQueryVector('{}')).toThrow(/name at least one vector/i)
  })

  it('rejects a ragged multi-vector', () => {
    expect(() => parseQueryVector('[[0.1, 0.2], []]')).toThrow(/finite numbers/)
  })
})

describe('resolveIncludeVector', () => {
  it('asks for nothing when vectors are off', () => {
    expect(resolveIncludeVector(false, ['title'])).toBe(false)
  })

  it('asks for everything when no names are given', () => {
    expect(resolveIncludeVector(true, undefined)).toBe(true)
    expect(resolveIncludeVector(true, [])).toBe(true)
  })

  it('asks for only the named vectors', () => {
    expect(resolveIncludeVector(true, ['title', 'body'])).toEqual(['title', 'body'])
  })
})

describe('buildSort', () => {
  it('returns undefined without usable specs', () => {
    expect(buildSort(fakeCollection(), undefined)).toBeUndefined()
    expect(buildSort(fakeCollection(), [])).toBeUndefined()
  })

  it('maps metadata pseudo-properties to their own builders', () => {
    const collection = fakeCollection()
    buildSort(collection, [{ property: '_creationTime', direction: 'desc' }])
    expect(collection.sort.calls).toEqual([{ method: 'byCreationTime', args: [false] }])
  })

  it('chains multiple sorts in order', () => {
    const collection = fakeCollection()
    buildSort(collection, [
      { property: 'price', direction: 'asc' },
      { property: '_id', direction: 'desc' }
    ])
    expect(collection.sort.calls).toEqual([
      { method: 'byProperty', args: ['price', true] },
      { method: 'byId', args: [false] }
    ])
  })
})

describe('buildTargetVector', () => {
  it('passes a single named vector straight through', () => {
    expect(buildTargetVector(fakeCollection(), req({ targetVector: 'title' }))).toBe('title')
  })

  it('builds a list join for sum/average/minimum', () => {
    const out = buildTargetVector(
      fakeCollection(),
      req({ multiTarget: { targets: ['a', 'b'], join: 'average' } })
    )
    expect(out).toEqual({ join: 'average', targets: ['a', 'b'] })
  })

  it('builds a weight map for manualWeights, defaulting missing weights to 1', () => {
    const out = buildTargetVector(
      fakeCollection(),
      req({ multiTarget: { targets: ['a', 'b'], join: 'manualWeights', weights: { a: 3 } } })
    )
    expect(out).toEqual({ join: 'manualWeights', weights: { a: 3, b: 1 } })
  })

  it('rejects an unknown join', () => {
    expect(() =>
      buildTargetVector(
        fakeCollection(),
        req({ multiTarget: { targets: ['a'], join: 'bogus' as never } })
      )
    ).toThrow(/Unknown multi-target join/)
  })
})

describe('buildQueryProperties', () => {
  it('returns undefined when nothing is selected', () => {
    expect(buildQueryProperties(req())).toBeUndefined()
  })

  it('appends ^weight only when the weight is meaningful', () => {
    const out = buildQueryProperties(
      req({
        queryProperties: [
          { property: 'title', weight: 2 },
          { property: 'body', weight: 1 },
          { property: 'tags' }
        ]
      })
    )
    expect(out).toEqual(['title^2', 'body', 'tags'])
  })
})

describe('buildReferences', () => {
  it('drops entries with no property', () => {
    expect(buildReferences([{ property: '' }])).toBeUndefined()
  })

  it('maps to linkOn and keeps optional fields', () => {
    expect(
      buildReferences([
        { property: 'hasCategory', targetCollection: 'Category', returnProperties: ['name'] }
      ])
    ).toEqual([{ linkOn: 'hasCategory', targetCollection: 'Category', returnProperties: ['name'] }])
  })
})

describe('buildSearchOptions', () => {
  it('carries limit, offset and autocut', () => {
    const opts = buildSearchOptions(fakeCollection(), req({ offset: 20, autoLimit: 2 }))
    expect(opts.limit).toBe(10)
    expect(opts.offset).toBe(20)
    expect(opts.autoLimit).toBe(2)
  })

  it('omits a zero offset rather than sending it', () => {
    const opts = buildSearchOptions(fakeCollection(), req({ offset: 0 }))
    expect(opts).not.toHaveProperty('offset')
  })

  it('only sorts on a plain fetch, since a scored search already has an order', () => {
    const sorted = buildSearchOptions(
      fakeCollection(),
      req({ type: 'fetch', sort: [{ property: 'price', direction: 'asc' }] })
    )
    expect(sorted.sort).toBeDefined()

    const scored = buildSearchOptions(
      fakeCollection(),
      req({ type: 'bm25', sort: [{ property: 'price', direction: 'asc' }] })
    )
    expect(scored.sort).toBeUndefined()
  })

  it('applies distance only to vector searches', () => {
    expect(buildSearchOptions(fakeCollection(), req({ type: 'nearText', distance: 0.3 })).distance).toBe(
      0.3
    )
    expect(
      buildSearchOptions(fakeCollection(), req({ type: 'bm25', distance: 0.3 })).distance
    ).toBeUndefined()
  })

  it('prefers distance over certainty when both are set', () => {
    const opts = buildSearchOptions(
      fakeCollection(),
      req({ type: 'nearVector', distance: 0.3, certainty: 0.8 })
    )
    expect(opts.distance).toBe(0.3)
    expect(opts.certainty).toBeUndefined()
  })

  it('adds hybrid-only options only to hybrid', () => {
    const hybrid = buildSearchOptions(
      fakeCollection(),
      req({ type: 'hybrid', alpha: 0.75, fusionType: 'RelativeScore' })
    )
    expect(hybrid.alpha).toBe(0.75)
    expect(hybrid.fusionType).toBe('RelativeScore')

    const bm25 = buildSearchOptions(fakeCollection(), req({ type: 'bm25', alpha: 0.75 }))
    expect(bm25.alpha).toBeUndefined()
  })

  it('expands an OR bm25 operator with a minimum match', () => {
    const opts = buildSearchOptions(
      fakeCollection(),
      req({ type: 'bm25', bm25Operator: { operator: 'or', minimumMatch: 2 } })
    )
    expect(opts.bm25Operator).toEqual({ operator: 'or', minimumMatch: 2 })
  })

  it('omits minimumMatch for an AND operator, which does not take one', () => {
    const opts = buildSearchOptions(
      fakeCollection(),
      req({ type: 'bm25', bm25Operator: { operator: 'and', minimumMatch: 2 } })
    )
    expect(opts.bm25Operator).toEqual({ operator: 'and' })
  })

  it('falls back to the search text when no rerank query is given', () => {
    const opts = buildSearchOptions(
      fakeCollection(),
      req({ type: 'bm25', queryText: 'shoes', rerank: { property: 'title' } })
    )
    expect(opts.rerank).toEqual({ property: 'title', query: 'shoes' })
  })

  it('narrows includeVector to the named vectors when some are chosen', () => {
    expect(
      buildSearchOptions(fakeCollection(), req({ includeVector: true, vectorNames: ['title'] }))
        .includeVector
    ).toEqual(['title'])
    expect(
      buildSearchOptions(fakeCollection(), req({ includeVector: true })).includeVector
    ).toBe(true)
  })

  it('names the mmr algorithm when diversity is requested', () => {
    const opts = buildSearchOptions(
      fakeCollection(),
      req({ type: 'nearText', queryText: 'shoes', diversity: { limit: 10, balance: 0.3 } })
    )
    expect(opts.diversity).toEqual({ type: 'mmr', limit: 10, balance: 0.3 })
  })

  it('leaves diversity off a keyword search, which cannot express it', () => {
    const opts = buildSearchOptions(
      fakeCollection(),
      req({ type: 'bm25', queryText: 'shoes', diversity: { limit: 10 } })
    )
    expect(opts.diversity).toBeUndefined()
  })

  it('sends a supplied vector as the vector half of a hybrid search', () => {
    const opts = buildSearchOptions(
      fakeCollection(),
      req({ type: 'hybrid', queryText: 'shoes', queryVector: '[0.1, 0.2]' })
    )
    expect(opts.vector).toEqual([0.1, 0.2])
  })

  it('leaves hybrid to vectorize the query text when no vector is given', () => {
    const opts = buildSearchOptions(
      fakeCollection(),
      req({ type: 'hybrid', queryText: 'shoes', queryVector: '  ' })
    )
    expect(opts.vector).toBeUndefined()
  })

  it('passes groupBy through', () => {
    const opts = buildSearchOptions(
      fakeCollection(),
      req({ groupBy: { property: 'brand', numberOfGroups: 3, objectsPerGroup: 2 } })
    )
    expect(opts.groupBy).toEqual({ property: 'brand', numberOfGroups: 3, objectsPerGroup: 2 })
  })
})

describe('dispatchSearch', () => {
  function fakeNamespaces() {
    const query = {
      fetchObjects: vi.fn(async () => ({ objects: [] })),
      nearText: vi.fn(async () => ({ objects: [] })),
      nearObject: vi.fn(async () => ({ objects: [] })),
      nearMedia: vi.fn(async () => ({ objects: [] })),
      nearImage: vi.fn(async () => ({ objects: [] })),
      hybrid: vi.fn(async () => ({ objects: [] }))
    }
    const generate = { ...query, nearText: vi.fn(async () => ({ objects: [] })) }
    return { query, generate } as any
  }

  it('calls the matching query method with the search term first', async () => {
    const collection = fakeNamespaces()
    await dispatchSearch(collection, req({ type: 'nearText', queryText: 'shoes' }), { limit: 5 })
    expect(collection.query.nearText).toHaveBeenCalledWith('shoes', { limit: 5 })
  })

  it('splices the generate options in after the term', async () => {
    const collection = fakeNamespaces()
    const gen = { singlePrompt: 'summarise' }
    await dispatchSearch(collection, req({ type: 'nearText', queryText: 'shoes' }), { limit: 5 }, gen)
    expect(collection.generate.nearText).toHaveBeenCalledWith('shoes', gen, { limit: 5 })
  })

  it('strips a data: URL prefix from media payloads', async () => {
    const collection = fakeNamespaces()
    await dispatchSearch(
      collection,
      req({ type: 'nearImage', queryMedia: 'data:image/png;base64,AAAA' }),
      {}
    )
    expect(collection.query.nearImage).toHaveBeenCalledWith('AAAA', {})
  })

  it('passes the media kind through for nearMedia', async () => {
    const collection = fakeNamespaces()
    await dispatchSearch(
      collection,
      req({ type: 'nearMedia', queryMedia: 'AAAA', mediaKind: 'audio' }),
      {}
    )
    expect(collection.query.nearMedia).toHaveBeenCalledWith('AAAA', 'audio', {})
  })

  it('rejects a nearObject search with no UUID', async () => {
    await expect(
      dispatchSearch(fakeNamespaces(), req({ type: 'nearObject' }), {})
    ).rejects.toThrow(/UUID of an existing object/)
  })

  it('rejects a media search with no file', async () => {
    await expect(
      dispatchSearch(fakeNamespaces(), req({ type: 'nearImage' }), {})
    ).rejects.toThrow(/image or media file/)
  })

  it('passes the call options last, so a cancel can reach the request', async () => {
    const collection = fakeNamespaces()
    const callOpts = { abortSignal: new AbortController().signal }
    await dispatchSearch(collection, req({ type: 'nearText', queryText: 'a' }), {}, undefined, callOpts)
    expect(collection.query.nearText).toHaveBeenCalledWith('a', {}, callOpts)

    await dispatchSearch(collection, req({ type: 'fetch' }), {}, undefined, callOpts)
    expect(collection.query.fetchObjects).toHaveBeenCalledWith({}, callOpts)

    const gen = { singlePrompt: 'summarise' }
    await dispatchSearch(collection, req({ type: 'nearText', queryText: 'a' }), {}, gen, callOpts)
    expect(collection.generate.nearText).toHaveBeenCalledWith('a', gen, {}, callOpts)
  })
})

describe('buildAggregateOptions', () => {
  it('bounds the matched set when no threshold is given', () => {
    const opts = buildAggregateOptions({ type: 'nearText', queryText: 'shoes' })
    expect(opts.objectLimit).toBe(DEFAULT_AGGREGATE_OBJECT_LIMIT)
  })

  it('leaves the set unbounded when a distance already bounds it', () => {
    const opts = buildAggregateOptions({ type: 'nearText', queryText: 'shoes', distance: 0.3 })
    expect(opts).toMatchObject({ distance: 0.3 })
    expect(opts.objectLimit).toBeUndefined()
  })

  it('prefers an explicit object limit over the default', () => {
    const opts = buildAggregateOptions({ type: 'nearText', objectLimit: 25 })
    expect(opts.objectLimit).toBe(25)
  })

  it('prefers distance over certainty, as the server rejects both', () => {
    const opts = buildAggregateOptions({ type: 'nearVector', distance: 0.4, certainty: 0.9 })
    expect(opts.distance).toBe(0.4)
    expect(opts.certainty).toBeUndefined()
  })

  it('keeps the base options it was handed', () => {
    const filters = { fake: 'filter' }
    const opts = buildAggregateOptions({ type: 'nearText' }, { filters, returnMetrics: ['m'] })
    expect(opts).toMatchObject({ filters, returnMetrics: ['m'] })
  })

  it('adds the hybrid knobs and weighted query properties', () => {
    const opts = buildAggregateOptions({
      type: 'hybrid',
      queryText: 'shoes',
      alpha: 0.7,
      maxVectorDistance: 0.5,
      queryProperties: [{ property: 'title', weight: 2 }, { property: 'body' }]
    })
    expect(opts).toMatchObject({
      alpha: 0.7,
      maxVectorDistance: 0.5,
      queryProperties: ['title^2', 'body']
    })
  })

  it('omits near-search thresholds on a hybrid aggregation', () => {
    const opts = buildAggregateOptions({ type: 'hybrid', queryText: 'shoes', distance: 0.3 })
    expect(opts.distance).toBeUndefined()
    expect(opts.objectLimit).toBe(DEFAULT_AGGREGATE_OBJECT_LIMIT)
  })
})

describe('dispatchAggregate', () => {
  function fakeAggregate() {
    const methods = () => ({
      nearText: vi.fn(async () => ({ totalCount: 1 })),
      nearVector: vi.fn(async () => ({ totalCount: 1 })),
      nearObject: vi.fn(async () => ({ totalCount: 1 })),
      nearImage: vi.fn(async () => ({ totalCount: 1 })),
      hybrid: vi.fn(async () => ({ totalCount: 1 }))
    })
    return { aggregate: { ...methods(), groupBy: methods() } } as any
  }

  it('calls the matching aggregate method', async () => {
    const collection = fakeAggregate()
    await dispatchAggregate(collection, { type: 'nearText', queryText: 'shoes' }, { objectLimit: 10 })
    expect(collection.aggregate.nearText).toHaveBeenCalledWith('shoes', { objectLimit: 10 })
  })

  it('routes to the groupBy namespace when asked', async () => {
    const collection = fakeAggregate()
    await dispatchAggregate(collection, { type: 'hybrid', queryText: 'shoes' }, {}, true)
    expect(collection.aggregate.groupBy.hybrid).toHaveBeenCalledWith('shoes', {})
    expect(collection.aggregate.hybrid).not.toHaveBeenCalled()
  })

  it('parses the query vector', async () => {
    const collection = fakeAggregate()
    await dispatchAggregate(collection, { type: 'nearVector', queryVector: '[0.1, 0.2]' }, {})
    expect(collection.aggregate.nearVector).toHaveBeenCalledWith([0.1, 0.2], {})
  })

  it('strips a data: URL prefix from the image payload', async () => {
    const collection = fakeAggregate()
    await dispatchAggregate(
      collection,
      { type: 'nearImage', queryMedia: 'data:image/png;base64,AAAA' },
      {}
    )
    expect(collection.aggregate.nearImage).toHaveBeenCalledWith('AAAA', {})
  })

  it('rejects searches that are missing their query term', async () => {
    const collection = fakeAggregate()
    await expect(dispatchAggregate(collection, { type: 'nearText' }, {})).rejects.toThrow(
      /needs a query/
    )
    await expect(dispatchAggregate(collection, { type: 'hybrid' }, {})).rejects.toThrow(
      /needs a query/
    )
    await expect(dispatchAggregate(collection, { type: 'nearObject' }, {})).rejects.toThrow(
      /UUID of an existing object/
    )
  })
})
