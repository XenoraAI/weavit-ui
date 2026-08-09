import { describe, it, expect } from 'vitest'
import { EMPTY_SETTINGS, buildPatch, readSettings } from './collectionSettings'

const CLASS = {
  class: 'Article',
  description: 'news',
  vectorizer: 'none',
  invertedIndexConfig: { bm25: { b: 0.75, k1: 1.2 }, cleanupIntervalSeconds: 60 },
  vectorIndexConfig: { ef: -1, dynamicEfMin: 100, filterStrategy: 'sweeping' },
  multiTenancyConfig: { enabled: true, autoTenantCreation: false }
}

describe('readSettings', () => {
  it('flattens the nested class config', () => {
    const s = readSettings(CLASS)
    expect(s.description).toBe('news')
    expect(s.bm25b).toBe(0.75)
    expect(s.bm25k1).toBe(1.2)
    expect(s.cleanupIntervalSeconds).toBe(60)
    expect(s.ef).toBe(-1)
    expect(s.dynamicEfMin).toBe(100)
    expect(s.filterStrategy).toBe('sweeping')
    expect(s.autoTenantCreation).toBe(false)
  })

  it('leaves absent values blank rather than defaulting them', () => {
    const s = readSettings({ class: 'Bare' })
    expect(s).toEqual(EMPTY_SETTINGS)
  })
})

describe('buildPatch', () => {
  it('is empty when nothing changed', () => {
    const s = readSettings(CLASS)
    expect(buildPatch(s, s)).toEqual({})
  })

  it('sends only the changed fields, nested back into their config objects', () => {
    const initial = readSettings(CLASS)
    const patch = buildPatch(initial, { ...initial, description: 'updated', bm25k1: 1.5 })
    expect(patch).toEqual({
      description: 'updated',
      invertedIndexConfig: { bm25: { k1: 1.5 } }
    })
  })

  it('omits vectorIndexConfig entirely when no vector setting changed', () => {
    const initial = readSettings(CLASS)
    const patch = buildPatch(initial, { ...initial, description: 'x' })
    expect(patch.vectorIndexConfig).toBeUndefined()
    expect(patch.multiTenancyConfig).toBeUndefined()
  })

  it('groups vector index changes together', () => {
    const initial = readSettings(CLASS)
    const patch = buildPatch(initial, { ...initial, ef: 128, filterStrategy: 'acorn' })
    expect(patch).toEqual({ vectorIndexConfig: { ef: 128, filterStrategy: 'acorn' } })
  })

  it('sends multi-tenancy toggles, including turning one off', () => {
    const initial = readSettings({ ...CLASS, multiTenancyConfig: { enabled: true, autoTenantCreation: true } })
    const patch = buildPatch(initial, { ...initial, autoTenantCreation: false })
    expect(patch).toEqual({ multiTenancyConfig: { autoTenantCreation: false } })
  })

  it('ignores a field cleared to blank instead of sending a bad value', () => {
    const initial = readSettings(CLASS)
    const patch = buildPatch(initial, { ...initial, bm25b: '' })
    expect(patch).toEqual({})
  })
})
