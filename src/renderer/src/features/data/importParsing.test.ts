import { describe, it, expect } from 'vitest'
import { parseCsvLine, parseImport } from './importParsing'

describe('parseCsvLine', () => {
  it('splits plain fields', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('keeps commas inside quoted fields', () => {
    expect(parseCsvLine('"Smith, John",42')).toEqual(['Smith, John', '42'])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsvLine('"say ""hi""",x')).toEqual(['say "hi"', 'x'])
  })

  it('preserves empty trailing fields', () => {
    expect(parseCsvLine('a,,')).toEqual(['a', '', ''])
  })
})

describe('parseImport — JSON', () => {
  it('accepts a bare array of property objects', () => {
    expect(parseImport('[{"title":"a"},{"title":"b"}]', 'json')).toEqual([
      { properties: { title: 'a' } },
      { properties: { title: 'b' } }
    ])
  })

  it('accepts a single object', () => {
    expect(parseImport('{"title":"a"}', 'json')).toEqual([{ properties: { title: 'a' } }])
  })

  it('round-trips the export shape, keeping id and vectors', () => {
    const text = JSON.stringify([
      { id: 'abc', properties: { title: 'a' }, vectors: { default: [0.1] } }
    ])
    expect(parseImport(text, 'json')).toEqual([
      { properties: { title: 'a' }, id: 'abc', vectors: { default: [0.1] } }
    ])
  })

  it('reads uuid as an alternative id field', () => {
    const text = JSON.stringify([{ uuid: 'abc', properties: { title: 'a' } }])
    expect(parseImport(text, 'json')[0].id).toBe('abc')
  })
})

describe('parseImport — JSONL', () => {
  it('reads one object per line and ignores blanks', () => {
    const text = '{"title":"a"}\n\n{"title":"b"}\n'
    expect(parseImport(text, 'jsonl')).toEqual([
      { properties: { title: 'a' } },
      { properties: { title: 'b' } }
    ])
  })
})

describe('parseImport — CSV', () => {
  it('uses the header row as property names', () => {
    const text = 'title,price\nWidget,9.99'
    expect(parseImport(text, 'csv')).toEqual([
      { properties: { title: 'Widget', price: 9.99 }, id: undefined }
    ])
  })

  it('lifts an _id column out of the properties', () => {
    const text = '_id,title\nabc,Widget'
    expect(parseImport(text, 'csv')).toEqual([{ properties: { title: 'Widget' }, id: 'abc' }])
  })

  it('coerces numbers, booleans and empty cells', () => {
    const text = 'n,b,empty\n42,true,'
    expect(parseImport(text, 'csv')[0].properties).toEqual({ n: 42, b: true, empty: null })
  })

  it('parses embedded JSON cells', () => {
    const text = 'tags\n"[""a"",""b""]"'
    expect(parseImport(text, 'csv')[0].properties.tags).toEqual(['a', 'b'])
  })

  it('leaves a malformed JSON-looking cell as text rather than failing the row', () => {
    const text = 'tags\n"[a, b"'
    expect(parseImport(text, 'csv')[0].properties.tags).toBe('[a, b')
  })

  it('rejects a file with no data rows', () => {
    expect(() => parseImport('title,price', 'csv')).toThrow(/header row and at least one data row/)
  })
})
