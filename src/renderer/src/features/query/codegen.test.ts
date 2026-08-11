import { describe, it, expect } from 'vitest'
import { generateCode } from './codegen'
import type { SearchRequest } from '@shared/types'

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

describe('generateCode — JavaScript', () => {
  it('emits the matching query method and collection', () => {
    const code = generateCode(req({ type: 'nearText', queryText: 'shoes' }), 'js')
    expect(code).toContain("client.collections.get(\"Product\")")
    expect(code).toContain('collection.query.nearText("shoes", {')
    expect(code).toContain('limit: 10')
  })

  it('omits the query term for a plain fetch', () => {
    expect(generateCode(req(), 'js')).toContain('collection.query.fetchObjects({')
  })

  it('imports Filters only when the query has filters', () => {
    expect(generateCode(req(), 'js')).not.toContain('Filters')
    const filtered = generateCode(
      req({ filters: [{ property: 'brand', operator: 'Equal', value: 'acme', valueType: 'text' }] }),
      'js'
    )
    expect(filtered).toContain("import weaviate, { Filters } from 'weaviate-client'")
    expect(filtered).toContain('collection.filter.byProperty("brand").equal("acme")')
  })

  it('renders an OR group with Filters.or', () => {
    const code = generateCode(
      req({
        filters: [
          {
            kind: 'group',
            operator: 'Or',
            children: [
              { property: 'brand', operator: 'Equal', value: 'a', valueType: 'text' },
              { property: 'brand', operator: 'Equal', value: 'b', valueType: 'text' }
            ]
          }
        ]
      }),
      'js'
    )
    expect(code).toContain('Filters.or(')
  })

  it('renders metadata filter targets with their own builders', () => {
    const code = generateCode(
      req({
        filters: [
          { property: '', target: 'creationTime', operator: 'GreaterThan', value: '2026-01-01', valueType: 'date' }
        ]
      }),
      'js'
    )
    expect(code).toContain('collection.filter.byCreationTime().greaterThan(new Date("2026-01-01"))')
  })

  it('emits numeric values unquoted and text values quoted', () => {
    const code = generateCode(
      req({
        filters: [
          { property: 'price', operator: 'LessThan', value: '99.5', valueType: 'number' },
          { property: 'brand', operator: 'Equal', value: 'acme', valueType: 'text' }
        ]
      }),
      'js'
    )
    expect(code).toContain('.lessThan(99.5)')
    expect(code).toContain('.equal("acme")')
  })

  it('includes a tenant scope when one is set', () => {
    expect(generateCode(req({ tenant: 'acme' }), 'js')).toContain('.withTenant("acme")')
  })

  it('renders bm25 property weights', () => {
    const code = generateCode(
      req({ type: 'bm25', queryText: 'x', queryProperties: [{ property: 'title', weight: 2 }] }),
      'js'
    )
    expect(code).toContain('queryProperties: ["title^2"]')
  })

  it('renders a sort chain only for fetch', () => {
    const code = generateCode(req({ sort: [{ property: 'price', direction: 'desc' }] }), 'js')
    expect(code).toContain('collection.sort.byProperty("price", false)')
  })
})

describe('generateCode — Python', () => {
  it('uses snake_case methods and arguments', () => {
    const code = generateCode(req({ type: 'nearText', queryText: 'shoes', limit: 5 }), 'python')
    expect(code).toContain('collection.query.near_text(')
    expect(code).toContain('query="shoes"')
    expect(code).toContain('limit=5')
  })

  it('renders Python booleans capitalized', () => {
    const code = generateCode(req({ includeVector: true }), 'python')
    expect(code).toContain('include_vector=True')
  })

  it('combines filters with the & operator', () => {
    const code = generateCode(
      req({
        filters: [
          { property: 'a', operator: 'Equal', value: '1', valueType: 'int' },
          { property: 'b', operator: 'Equal', value: '2', valueType: 'int' }
        ]
      }),
      'python'
    )
    expect(code).toContain('Filter.by_property("a").equal(1) & Filter.by_property("b").equal(2)')
  })

  it('uses | inside an OR group', () => {
    const code = generateCode(
      req({
        filters: [
          {
            kind: 'group',
            operator: 'Or',
            children: [
              { property: 'a', operator: 'Equal', value: '1', valueType: 'int' },
              { property: 'a', operator: 'Equal', value: '2', valueType: 'int' }
            ]
          }
        ]
      }),
      'python'
    )
    expect(code).toContain(' | ')
  })
})

describe('generateCode — GraphQL', () => {
  it('nests the collection under Get with its arguments', () => {
    const code = generateCode(req({ type: 'bm25', queryText: 'shoes' }), 'graphql')
    expect(code).toContain('Get {')
    expect(code).toContain('Product(')
    expect(code).toContain('bm25: { query: "shoes" }')
  })

  it('includes hybrid alpha', () => {
    const code = generateCode(req({ type: 'hybrid', queryText: 'x', alpha: 0.3 }), 'graphql')
    expect(code).toContain('alpha: 0.3')
  })

  it('lists the requested return properties', () => {
    const code = generateCode(req({ returnProperties: ['title', 'price'] }), 'graphql')
    expect(code).toContain('      title')
    expect(code).toContain('      price')
  })

  it('asks for scoring metadata on a scored search but timestamps on a fetch', () => {
    expect(generateCode(req({ type: 'nearText', queryText: 'x' }), 'graphql')).toContain('distance')
    expect(generateCode(req(), 'graphql')).toContain('creationTimeUnix')
  })
})
