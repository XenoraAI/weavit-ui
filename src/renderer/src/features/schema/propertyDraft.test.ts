import { describe, it, expect } from 'vitest'
import {
  duplicateNames,
  newPropertyDraft,
  supportsFilterable,
  supportsSearchable,
  toPropertyDefinition
} from './propertyDraft'

const draft = (patch: Partial<ReturnType<typeof newPropertyDraft>> = {}) => ({
  ...newPropertyDraft(),
  ...patch
})

describe('toPropertyDefinition', () => {
  it('emits tokenization and both index flags for text', () => {
    expect(toPropertyDefinition(draft({ name: ' title ' }))).toEqual({
      name: 'title',
      dataType: ['text'],
      tokenization: 'word',
      indexFilterable: true,
      indexSearchable: true
    })
  })

  it('drops tokenization and indexSearchable for non-text types', () => {
    const def = toPropertyDefinition(draft({ name: 'count', dataType: 'int' }))
    expect(def).toEqual({ name: 'count', dataType: ['int'], indexFilterable: true })
    expect(def.tokenization).toBeUndefined()
    expect(def.indexSearchable).toBeUndefined()
  })

  it('keeps text options for text[] arrays', () => {
    const def = toPropertyDefinition(draft({ name: 'tags', dataType: 'text[]' }))
    expect(def.tokenization).toBe('word')
    expect(def.indexSearchable).toBe(true)
  })

  it('omits indexFilterable for types that do not support it', () => {
    for (const dataType of ['blob', 'geoCoordinates', 'phoneNumber', 'object', 'object[]']) {
      const def = toPropertyDefinition(draft({ name: 'p', dataType }))
      expect(def.indexFilterable, dataType).toBeUndefined()
      expect(def.indexSearchable, dataType).toBeUndefined()
    }
  })

  it('includes description only when non-blank', () => {
    expect(toPropertyDefinition(draft({ name: 'a', description: '  ' })).description).toBeUndefined()
    expect(toPropertyDefinition(draft({ name: 'a', description: 'hi' })).description).toBe('hi')
  })

  it('carries switches through when turned off', () => {
    const def = toPropertyDefinition(
      draft({ name: 'a', indexFilterable: false, indexSearchable: false })
    )
    expect(def.indexFilterable).toBe(false)
    expect(def.indexSearchable).toBe(false)
  })
})

describe('supportsFilterable / supportsSearchable', () => {
  it('matches Weaviate’s inverted-index rules', () => {
    expect(supportsFilterable('int')).toBe(true)
    expect(supportsFilterable('blob')).toBe(false)
    expect(supportsFilterable('object[]')).toBe(false)
    expect(supportsSearchable('text')).toBe(true)
    expect(supportsSearchable('text[]')).toBe(true)
    expect(supportsSearchable('int')).toBe(false)
  })
})

describe('duplicateNames', () => {
  it('flags repeats case-insensitively', () => {
    expect([...duplicateNames(['title', 'Title', 'body'])]).toEqual(['title'])
  })

  it('ignores blank rows', () => {
    expect(duplicateNames(['', '  ', 'a']).size).toBe(0)
  })

  it('is empty when all names are distinct', () => {
    expect(duplicateNames(['a', 'b', 'c']).size).toBe(0)
  })
})
