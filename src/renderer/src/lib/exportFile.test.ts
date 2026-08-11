import { describe, it, expect } from 'vitest'
import { columnsOf, csvCell, toCsv, toJsonl } from './exportFile'
import type { WeaviateObject } from '@shared/types'

function obj(uuid: string, properties: Record<string, unknown>): WeaviateObject {
  return { uuid, properties }
}

describe('csvCell', () => {
  it('renders null and undefined as empty', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes fields containing a comma, quote or newline', () => {
    expect(csvCell('Smith, John')).toBe('"Smith, John"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })

  it('leaves plain values unquoted', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell(42)).toBe('42')
  })

  it('serializes objects as JSON', () => {
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"')
  })
})

describe('columnsOf', () => {
  it('unions keys across objects in first-seen order', () => {
    const rows = [obj('1', { a: 1, b: 2 }), obj('2', { b: 3, c: 4 })]
    expect(columnsOf(rows)).toEqual(['a', 'b', 'c'])
  })
})

describe('toCsv', () => {
  it('writes a header plus one row per object', () => {
    const csv = toCsv([obj('u1', { title: 'a' }), obj('u2', { title: 'b' })])
    expect(csv.split('\n')).toEqual(['_id,title', 'u1,a', 'u2,b'])
  })

  it('leaves missing properties blank rather than shifting columns', () => {
    const csv = toCsv([obj('u1', { a: 1, b: 2 }), obj('u2', { a: 3 })])
    expect(csv.split('\n')[2]).toBe('u2,3,')
  })

  it('adds a vectors column only when asked', () => {
    expect(toCsv([obj('u1', { a: 1 })]).split('\n')[0]).toBe('_id,a')
    expect(toCsv([obj('u1', { a: 1 })], true).split('\n')[0]).toBe('_id,a,_vectors')
  })
})

describe('toJsonl', () => {
  it('writes one importable object per line', () => {
    const lines = toJsonl([obj('u1', { a: 1 }), obj('u2', { a: 2 })]).split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toEqual({ id: 'u1', properties: { a: 1 } })
  })
})
