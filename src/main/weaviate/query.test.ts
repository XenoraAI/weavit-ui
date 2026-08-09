import { describe, it, expect } from 'vitest'
import { parseQueryVector } from './query'

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
