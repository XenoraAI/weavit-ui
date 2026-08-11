import { describe, it, expect } from 'vitest'
import { metricKindFor, parseQueryVector } from './query'

describe('metricKindFor', () => {
  it('maps scalar types onto their aggregation family', () => {
    expect(metricKindFor(['text'])).toBe('text')
    expect(metricKindFor(['string'])).toBe('text')
    expect(metricKindFor(['int'])).toBe('integer')
    expect(metricKindFor(['number'])).toBe('number')
    expect(metricKindFor(['boolean'])).toBe('boolean')
    expect(metricKindFor(['date'])).toBe('date')
  })

  it('treats an array type the same as its element type', () => {
    expect(metricKindFor(['text[]'])).toBe('text')
    expect(metricKindFor(['int[]'])).toBe('integer')
  })

  it('returns undefined for types Weaviate cannot aggregate', () => {
    expect(metricKindFor(['blob'])).toBeUndefined()
    expect(metricKindFor(['geoCoordinates'])).toBeUndefined()
    expect(metricKindFor(['phoneNumber'])).toBeUndefined()
    expect(metricKindFor(['object'])).toBeUndefined()
    // A capitalized type is a cross-reference.
    expect(metricKindFor(['Author'])).toBeUndefined()
    expect(metricKindFor([])).toBeUndefined()
  })
})

describe('parseQueryVector', () => {
  it('parses a JSON array of numbers', () => {
    expect(parseQueryVector('[0.1, -0.2, 3]')).toEqual([0.1, -0.2, 3])
  })

  it('rejects blank input instead of throwing a SyntaxError', () => {
    expect(() => parseQueryVector('')).toThrow(/Query vector is required/)
    expect(() => parseQueryVector('   ')).toThrow(/Query vector is required/)
    expect(() => parseQueryVector(undefined)).toThrow(/Query vector is required/)
  })

  it('rejects malformed JSON with a readable message', () => {
    expect(() => parseQueryVector('[0.1, 0.2')).toThrow(/not valid JSON/)
  })

  it('rejects non-arrays and empty arrays', () => {
    expect(() => parseQueryVector('"hello"')).toThrow(/non-empty JSON array/)
    expect(() => parseQueryVector('[]')).toThrow(/non-empty JSON array/)
  })

  it('rejects non-numeric and non-finite elements', () => {
    expect(() => parseQueryVector('[0.1, "a"]')).toThrow(/finite numbers/)
    expect(() => parseQueryVector('[0.1, null]')).toThrow(/finite numbers/)
  })
})
