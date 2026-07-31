import { describe, it, expect, vi } from 'vitest'
import { buildFilter } from './filters'
import type { FilterCondition } from '@shared/types'

// A fake collection.filter / Filters that records the calls buildFilter makes,
// so we can assert operator mapping and value coercion without a live server.
function fakeCollection() {
  const calls: Array<{ prop: string; method: string; value: unknown }> = []
  const collection = {
    filter: {
      byProperty(prop: string) {
        const make = (method: string) => (value: unknown) => {
          const node = { prop, method, value }
          calls.push(node)
          return node
        }
        return {
          equal: make('equal'),
          notEqual: make('notEqual'),
          greaterThan: make('greaterThan'),
          greaterOrEqual: make('greaterOrEqual'),
          lessThan: make('lessThan'),
          lessOrEqual: make('lessOrEqual'),
          like: make('like'),
          containsAny: make('containsAny'),
          containsAll: make('containsAll')
        }
      }
    }
  }
  const Filters = { and: vi.fn((...args: unknown[]) => ({ and: args })) }
  return { collection, Filters, calls }
}

describe('buildFilter', () => {
  it('returns undefined with no conditions', () => {
    const { collection, Filters } = fakeCollection()
    expect(buildFilter(collection, Filters, [])).toBeUndefined()
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

  it('returns a single node (not AND) for one condition', () => {
    const { collection, Filters } = fakeCollection()
    const node = buildFilter(collection, Filters, [
      { property: 'name', operator: 'Like', value: 'foo*', valueType: 'text' }
    ])
    expect(node).toEqual({ prop: 'name', method: 'like', value: 'foo*' })
    expect(Filters.and).not.toHaveBeenCalled()
  })
})
