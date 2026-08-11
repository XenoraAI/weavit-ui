import { describe, it, expect, vi } from 'vitest'
import { buildFilter, parseGeoRange, referenceFilterUnsupported, splitList } from './filters'
import type { FilterCondition, FilterNode } from '@shared/types'

// A fake collection.filter / Filters that records the calls buildFilter makes,
// so we can assert operator mapping and value coercion without a live server.
function fakeCollection() {
  const calls: Array<{ prop: string; method: string; value: unknown }> = []

  const builder = (prop: string, methods: string[]) => {
    const out: Record<string, (value: unknown) => unknown> = {}
    for (const method of methods) {
      out[method] = (value: unknown) => {
        const node = { prop, method, value }
        calls.push(node)
        return node
      }
    }
    return out
  }

  const PROPERTY_METHODS = [
    'equal',
    'notEqual',
    'greaterThan',
    'greaterOrEqual',
    'lessThan',
    'lessOrEqual',
    'like',
    'containsAny',
    'containsAll',
    'isNull',
    'withinGeoRange'
  ]

  // byRef returns the same namespace again, so a hop just prefixes the property
  // name it eventually reports — which is enough to assert the walk.
  const filterNamespace = (prefix: string): Record<string, any> => ({
    byProperty: (prop: string, length?: boolean) =>
      builder(`${prefix}${length ? `${prop}#length` : prop}`, PROPERTY_METHODS),
    byId: () => builder(`${prefix}_id`, ['equal', 'notEqual', 'containsAny']),
    byCreationTime: () =>
      builder(`${prefix}_creationTime`, [
        'equal',
        'notEqual',
        'containsAny',
        'greaterThan',
        'greaterOrEqual',
        'lessThan',
        'lessOrEqual'
      ]),
    byUpdateTime: () =>
      builder(`${prefix}_updateTime`, ['equal', 'notEqual', 'greaterThan', 'lessThan']),
    byRefCount: (linkOn: string) =>
      builder(`${prefix}${linkOn}#count`, [
        'equal',
        'notEqual',
        'greaterThan',
        'greaterOrEqual',
        'lessThan',
        'lessOrEqual'
      ]),
    byRef: (linkOn: string) => filterNamespace(`${prefix}${linkOn}->`),
    byRefMultiTarget: (linkOn: string, targetCollection: string) =>
      filterNamespace(`${prefix}${linkOn}(${targetCollection})->`)
  })

  const collection = { filter: filterNamespace('') }

  const Filters = {
    and: vi.fn((...args: unknown[]) => ({ and: args })),
    or: vi.fn((...args: unknown[]) => ({ or: args }))
  }
  return { collection, Filters, calls }
}

describe('splitList', () => {
  it('trims entries and drops empties', () => {
    expect(splitList('a, b ,  , c')).toEqual(['a', 'b', 'c'])
  })

  it('honours an escaped comma so values may contain one', () => {
    expect(splitList('a\\,b, c')).toEqual(['a,b', 'c'])
  })
})

describe('parseGeoRange', () => {
  it('parses lat,lon,distance', () => {
    expect(parseGeoRange('52.39, 4.84, 2000')).toEqual({
      latitude: 52.39,
      longitude: 4.84,
      distance: 2000
    })
  })

  it('rejects anything that is not three numbers', () => {
    expect(() => parseGeoRange('52.39, 4.84')).toThrow(/latitude,longitude,distanceInMeters/)
    expect(() => parseGeoRange('a, b, c')).toThrow(/latitude,longitude,distanceInMeters/)
  })
})

describe('buildFilter', () => {
  it('returns undefined with no conditions', () => {
    const { collection, Filters } = fakeCollection()
    expect(buildFilter(collection, Filters, [])).toBeUndefined()
    expect(buildFilter(collection, Filters, undefined)).toBeUndefined()
  })

  it('maps operators and coerces value types', () => {
    const { collection, Filters, calls } = fakeCollection()
    const conds: FilterCondition[] = [
      { property: 'age', operator: 'GreaterThanEqual', value: '21', valueType: 'int' },
      { property: 'active', operator: 'Equal', value: 'true', valueType: 'boolean' }
    ]
    buildFilter(collection, Filters, conds)
    expect(calls[0]).toEqual({ prop: 'age', method: 'greaterOrEqual', value: 21 })
    expect(calls[1]).toEqual({ prop: 'active', method: 'equal', value: true })
    expect(Filters.and).toHaveBeenCalledOnce()
  })

  it('splits comma lists for containsAny', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      { property: 'tags', operator: 'ContainsAny', value: 'a, b ,c', valueType: 'text' }
    ])
    expect(calls[0]).toEqual({ prop: 'tags', method: 'containsAny', value: ['a', 'b', 'c'] })
  })

  it('coerces list elements to the declared value type', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      { property: 'sizes', operator: 'ContainsAll', value: '1, 2, 3', valueType: 'int' }
    ])
    expect(calls[0].value).toEqual([1, 2, 3])
  })

  it('returns a single node (not AND) for one condition', () => {
    const { collection, Filters } = fakeCollection()
    const node = buildFilter(collection, Filters, [
      { property: 'name', operator: 'Like', value: 'foo*', valueType: 'text' }
    ])
    expect(node).toEqual({ prop: 'name', method: 'like', value: 'foo*' })
    expect(Filters.and).not.toHaveBeenCalled()
  })

  it('builds OR groups and nests them under a top-level AND', () => {
    const { collection, Filters } = fakeCollection()
    const nodes: FilterNode[] = [
      { property: 'inStock', operator: 'Equal', value: 'true', valueType: 'boolean' },
      {
        kind: 'group',
        operator: 'Or',
        children: [
          { property: 'brand', operator: 'Equal', value: 'acme', valueType: 'text' },
          { property: 'brand', operator: 'Equal', value: 'globex', valueType: 'text' }
        ]
      }
    ]
    buildFilter(collection, Filters, nodes)
    expect(Filters.or).toHaveBeenCalledOnce()
    expect(Filters.and).toHaveBeenCalledOnce()
  })

  it('collapses a group with a single usable child', () => {
    const { collection, Filters } = fakeCollection()
    const node = buildFilter(collection, Filters, [
      {
        kind: 'group',
        operator: 'Or',
        children: [{ property: 'brand', operator: 'Equal', value: 'acme', valueType: 'text' }]
      }
    ])
    expect(node).toEqual({ prop: 'brand', method: 'equal', value: 'acme' })
    expect(Filters.or).not.toHaveBeenCalled()
  })

  it('drops groups whose children are all unusable', () => {
    const { collection, Filters } = fakeCollection()
    const node = buildFilter(collection, Filters, [
      {
        kind: 'group',
        operator: 'Or',
        children: [{ property: '', operator: 'Equal', value: 'x', valueType: 'text' }]
      }
    ])
    expect(node).toBeUndefined()
  })

  it('routes metadata targets to their own builders', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      { property: '', target: 'id', operator: 'Equal', value: 'abc', valueType: 'uuid' }
    ])
    expect(calls[0]).toEqual({ prop: '_id', method: 'equal', value: 'abc' })
  })

  it('parses time filters into Date objects', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      {
        property: '',
        target: 'creationTime',
        operator: 'GreaterThan',
        value: '2026-01-01',
        valueType: 'date'
      }
    ])
    expect(calls[0].value).toBeInstanceOf(Date)
  })

  it('treats a length target as an integer comparison', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      {
        property: 'title',
        target: 'propertyLength',
        operator: 'GreaterThan',
        value: '10',
        valueType: 'text'
      }
    ])
    expect(calls[0]).toEqual({ prop: 'title#length', method: 'greaterThan', value: 10 })
  })

  it('converts IsNull to a boolean', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      { property: 'notes', operator: 'IsNull', value: 'true', valueType: 'text' }
    ])
    expect(calls[0]).toEqual({ prop: 'notes', method: 'isNull', value: true })
  })

  it('builds a geo range value', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      {
        property: 'location',
        operator: 'WithinGeoRange',
        value: '52.39,4.84,2000',
        valueType: 'geo'
      }
    ])
    expect(calls[0].value).toEqual({ latitude: 52.39, longitude: 4.84, distance: 2000 })
  })

  it('rejects an operator the target does not support', () => {
    const { collection, Filters } = fakeCollection()
    expect(() =>
      buildFilter(collection, Filters, [
        { property: '', target: 'id', operator: 'Like', value: 'x*', valueType: 'text' }
      ])
    ).toThrow(/Equal, NotEqual and ContainsAny/)
  })

  it('rejects a value that does not match its declared type', () => {
    const { collection, Filters } = fakeCollection()
    expect(() =>
      buildFilter(collection, Filters, [
        { property: 'age', operator: 'Equal', value: 'not-a-number', valueType: 'int' }
      ])
    ).toThrow(/not a valid integer/)
  })
})

describe('buildFilter over cross-references', () => {
  it('walks a single-target reference before applying the condition', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      {
        property: 'name',
        operator: 'Equal',
        value: 'Ada',
        valueType: 'text',
        referencePath: [{ property: 'author' }]
      }
    ])
    expect(calls[0]).toEqual({ prop: 'author->name', method: 'equal', value: 'Ada' })
  })

  it('names the target collection for a multi-target reference', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      {
        property: 'name',
        operator: 'Like',
        value: 'A*',
        valueType: 'text',
        referencePath: [{ property: 'author', targetCollection: 'Person' }]
      }
    ])
    expect(calls[0].prop).toBe('author(Person)->name')
  })

  it('walks nested references in order', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      {
        property: 'country',
        operator: 'Equal',
        value: 'NL',
        valueType: 'text',
        referencePath: [{ property: 'author' }, { property: 'employer' }]
      }
    ])
    expect(calls[0].prop).toBe('author->employer->country')
  })

  it('applies metadata targets to the referenced object', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      {
        property: '',
        target: 'id',
        operator: 'Equal',
        value: 'abc',
        valueType: 'uuid',
        referencePath: [{ property: 'author' }]
      }
    ])
    expect(calls[0]).toEqual({ prop: 'author->_id', method: 'equal', value: 'abc' })
  })

  it('filters on how many objects a reference points at', () => {
    const { collection, Filters, calls } = fakeCollection()
    buildFilter(collection, Filters, [
      {
        property: 'author',
        target: 'referenceCount',
        operator: 'GreaterThan',
        value: '2',
        valueType: 'text'
      }
    ])
    expect(calls[0]).toEqual({ prop: 'author#count', method: 'greaterThan', value: 2 })
  })

  it('rejects an operator a reference count cannot express', () => {
    const { collection, Filters } = fakeCollection()
    expect(() =>
      buildFilter(collection, Filters, [
        {
          property: 'author',
          target: 'referenceCount',
          operator: 'Like',
          value: '2*',
          valueType: 'text'
        }
      ])
    ).toThrow(/reference count does not support Like/)
  })

  it('translates the aggregate API refusing a single-target reference filter', () => {
    const msg = referenceFilterUnsupported(
      'Cannot use Filter.byRef() in the aggregate API currently. Instead use Filter.byRefMultiTarget() and specify the target collection explicitly.'
    )
    expect(msg).toMatch(/Set the target collection/)
  })

  it('leaves every other error alone', () => {
    expect(referenceFilterUnsupported('connection refused')).toBeUndefined()
  })

  it('drops a condition whose reference hop is still blank', () => {
    const { collection, Filters } = fakeCollection()
    const node = buildFilter(collection, Filters, [
      {
        property: 'name',
        operator: 'Equal',
        value: 'Ada',
        valueType: 'text',
        referencePath: [{ property: '' }]
      }
    ])
    expect(node).toBeUndefined()
  })
})
