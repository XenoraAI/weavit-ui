import { describe, it, expect } from 'vitest'
import { deepMerge } from './collections'

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
