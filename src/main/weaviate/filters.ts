import type { FilterCondition } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Coerce a stringified filter value to the type Weaviate expects.
function coerce(cond: FilterCondition): any {
  const raw = cond.value
  switch (cond.valueType) {
    case 'int':
      return parseInt(raw, 10)
    case 'number':
      return parseFloat(raw)
    case 'boolean':
      return raw === 'true' || raw === '1'
    default:
      return raw
  }
}

const METHOD: Record<string, string> = {
  Equal: 'equal',
  NotEqual: 'notEqual',
  GreaterThan: 'greaterThan',
  GreaterThanEqual: 'greaterOrEqual',
  LessThan: 'lessThan',
  LessThanEqual: 'lessOrEqual',
  Like: 'like',
  ContainsAny: 'containsAny',
  ContainsAll: 'containsAll'
}

/** Build a Weaviate filter (AND of all conditions) from the UI conditions.
 *  `collection` is a weaviate Collection; `Filters` is the client's Filters. */
export function buildFilter(collection: any, Filters: any, conditions: FilterCondition[]): any {
  const valid = conditions.filter((c) => c.property && c.operator)
  if (valid.length === 0) return undefined

  const built = valid.map((cond) => {
    const method = METHOD[cond.operator]
    const byProp = collection.filter.byProperty(cond.property)
    const value =
      cond.operator === 'ContainsAny' || cond.operator === 'ContainsAll'
        ? String(cond.value)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : coerce(cond)
    return byProp[method](value)
  })

  return built.length === 1 ? built[0] : Filters.and(...built)
}
