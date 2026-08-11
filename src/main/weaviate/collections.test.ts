import { describe, it, expect } from 'vitest'
import { deepMerge, toConfig } from './collections'

describe('deepMerge', () => {
  it('keeps untouched top-level fields', () => {
    const current = { class: 'Article', vectorizer: 'none', description: 'old' }
    expect(deepMerge(current, { description: 'new' })).toEqual({
      class: 'Article',
      vectorizer: 'none',
      description: 'new'
    })
  })

  it('merges nested config objects instead of replacing them', () => {
    const current = {
      invertedIndexConfig: { bm25: { b: 0.75, k1: 1.2 }, cleanupIntervalSeconds: 60 }
    }
    expect(deepMerge(current, { invertedIndexConfig: { bm25: { k1: 1.5 } } })).toEqual({
      invertedIndexConfig: { bm25: { b: 0.75, k1: 1.5 }, cleanupIntervalSeconds: 60 }
    })
  })

  it('replaces arrays wholesale', () => {
    const current = { properties: [{ name: 'a' }, { name: 'b' }] }
    expect(deepMerge(current, { properties: [{ name: 'c' }] })).toEqual({
      properties: [{ name: 'c' }]
    })
  })

  it('adds config objects the class did not have', () => {
    expect(deepMerge({ class: 'X' }, { multiTenancyConfig: { autoTenantCreation: true } })).toEqual({
      class: 'X',
      multiTenancyConfig: { autoTenantCreation: true }
    })
  })

  it('tolerates a non-object current definition', () => {
    expect(deepMerge(null, { description: 'x' })).toEqual({ description: 'x' })
  })
})

describe('toConfig', () => {
  it('separates cross-references from ordinary properties', () => {
    const c = toConfig({
      name: 'Article',
      properties: [
        { name: 'title', dataType: ['text'] },
        { name: 'hasAuthor', dataType: ['Author'] }
      ]
    })
    expect(c.properties.map((p) => p.name)).toEqual(['title'])
    expect(c.references).toEqual([
      { name: 'hasAuthor', targetCollections: ['Author'], description: undefined }
    ])
  })

  it('prefers an explicit references array when the server sends one', () => {
    const c = toConfig({
      name: 'Article',
      properties: [{ name: 'title', dataType: ['text'] }],
      references: [{ name: 'hasAuthor', targetCollections: ['Author'] }]
    })
    expect(c.references).toHaveLength(1)
    expect(c.references[0].targetCollections).toEqual(['Author'])
  })

  it('normalizes a string dataType into an array', () => {
    const c = toConfig({ name: 'X', properties: [{ name: 'title', dataType: 'text' }] })
    expect(c.properties[0].dataType).toEqual(['text'])
  })

  it('reads every named vector space', () => {
    const c = toConfig({
      name: 'X',
      vectorizers: {
        title: { vectorizer: { name: 'text2vec-openai' }, indexType: 'hnsw' },
        body: { vectorizer: 'none', indexType: 'flat' }
      }
    })
    expect(c.namedVectors.map((v) => v.name).sort()).toEqual(['body', 'title'])
    expect(c.namedVectors.find((v) => v.name === 'title')?.vectorizer).toBe('text2vec-openai')
  })

  it('surfaces a legacy single vector space as "default"', () => {
    const c = toConfig({
      name: 'X',
      vectorizer: 'text2vec-openai',
      vectorIndexType: 'hnsw',
      vectorIndexConfig: { ef: -1 }
    })
    expect(c.namedVectors).toHaveLength(1)
    expect(c.namedVectors[0].name).toBe('default')
    expect(c.namedVectors[0].indexType).toBe('hnsw')
  })

  it('lifts the quantizer out of the vector index config', () => {
    const c = toConfig({
      name: 'X',
      vectorizer: 'none',
      vectorIndexConfig: { quantizer: { type: 'pq', segments: 96 } }
    })
    expect(c.namedVectors[0].quantizer).toEqual({ type: 'pq', config: { segments: 96 } })
  })

  it('reports no quantizer when none is configured', () => {
    const c = toConfig({ name: 'X', vectorizer: 'none', vectorIndexConfig: { ef: 64 } })
    expect(c.namedVectors[0].quantizer).toBeUndefined()
  })

  it('reads module names from either a string or an object', () => {
    expect(toConfig({ name: 'X', generative: 'generative-openai' }).generative).toBe(
      'generative-openai'
    )
    expect(toConfig({ name: 'X', reranker: { name: 'reranker-cohere' } }).reranker).toBe(
      'reranker-cohere'
    )
  })

  it('defaults multi-tenancy to disabled when absent', () => {
    expect(toConfig({ name: 'X' }).multiTenancy.enabled).toBe(false)
  })
})
