import type { FilterCondition, FilterNode, ReferenceHop } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// The renderer models filters as a tree of AND/OR groups over leaf conditions.
// This module turns that tree into the client's FilterValue objects. Leaves can
// target a property, a property's length, one of the object metadata fields
// (id / creation time / update time), or the number of objects a
// cross-reference points at — the client exposes each through its own builder
// rather than as pseudo-properties. A leaf may also carry a `referencePath`,
// which walks one or more cross-references first so the condition is evaluated
// against the referenced object.

export function isGroup(node: FilterNode): node is Extract<FilterNode, { kind: 'group' }> {
  return (node as any).kind === 'group'
}

/** Split a comma-separated list, honouring backslash-escaped commas. */
export function splitList(raw: string): string[] {
  const out: string[] = []
  let current = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '\\' && raw[i + 1] === ',') {
      current += ','
      i++
      continue
    }
    if (ch === ',') {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  out.push(current)
  return out.map((s) => s.trim()).filter((s) => s.length > 0)
}

function coerceScalar(raw: string, valueType: FilterCondition['valueType']): any {
  switch (valueType) {
    case 'int': {
      const n = parseInt(raw, 10)
      if (Number.isNaN(n)) throw new Error(`"${raw}" is not a valid integer`)
      return n
    }
    case 'number': {
      const n = parseFloat(raw)
      if (Number.isNaN(n)) throw new Error(`"${raw}" is not a valid number`)
      return n
    }
    case 'boolean':
      return raw === 'true' || raw === '1'
    case 'date': {
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) throw new Error(`"${raw}" is not a valid date`)
      return d
    }
    default:
      // text and uuid both travel as strings.
      return raw
  }
}

/** ContainsAny/All take a list whose element type must match the property. */
function coerceList(cond: FilterCondition): any[] {
  return splitList(cond.value).map((v) => coerceScalar(v, cond.valueType))
}

/** "lat,lon,distanceMeters" -> the client's GeoRangeFilter. */
export function parseGeoRange(raw: string): {
  latitude: number
  longitude: number
  distance: number
} {
  const parts = splitList(raw).map((p) => Number(p))
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(
      'Geo range must be "latitude,longitude,distanceInMeters" — e.g. 52.39,4.84,2000'
    )
  }
  return { latitude: parts[0], longitude: parts[1], distance: parts[2] }
}

const PROPERTY_METHOD: Record<string, string> = {
  Equal: 'equal',
  NotEqual: 'notEqual',
  GreaterThan: 'greaterThan',
  GreaterThanEqual: 'greaterOrEqual',
  LessThan: 'lessThan',
  LessThanEqual: 'lessOrEqual',
  Like: 'like',
  ContainsAny: 'containsAny',
  ContainsAll: 'containsAll',
  IsNull: 'isNull',
  WithinGeoRange: 'withinGeoRange'
}

/** byId / byCreationTime / byUpdateTime expose only a subset of the operators. */
const ID_OPERATORS = new Set(['Equal', 'NotEqual', 'ContainsAny'])
const TIME_OPERATORS = new Set([
  'Equal',
  'NotEqual',
  'ContainsAny',
  'GreaterThan',
  'GreaterThanEqual',
  'LessThan',
  'LessThanEqual'
])
/** A reference count is a plain integer comparison. */
const COUNT_OPERATORS = new Set([
  'Equal',
  'NotEqual',
  'GreaterThan',
  'GreaterThanEqual',
  'LessThan',
  'LessThanEqual'
])

/**
 * Walks the cross-references named in `referencePath` and returns the filter
 * namespace of the collection at the end of the walk. Each hop returns the same
 * shape as `collection.filter`, so hops nest to any depth. Without a path this
 * is just `collection.filter` and nothing changes.
 */
export function referenceFilterBase(collection: any, path: ReferenceHop[] | undefined): any {
  let base = collection.filter
  for (const hop of path ?? []) {
    if (!hop.property) {
      throw new Error('A reference hop needs the name of a cross-reference property')
    }
    // A multi-target reference is ambiguous until you say which of its target
    // collections you mean; a single-target one takes the shorter builder.
    base = hop.targetCollection
      ? base.byRefMultiTarget(hop.property, hop.targetCollection)
      : base.byRef(hop.property)
  }
  return base
}

function builderFor(collection: any, cond: FilterCondition): any {
  const target = cond.target ?? 'property'
  const filter = referenceFilterBase(collection, cond.referencePath)
  switch (target) {
    case 'id':
      if (!ID_OPERATORS.has(cond.operator)) {
        throw new Error(`Filtering by id supports Equal, NotEqual and ContainsAny — not ${cond.operator}`)
      }
      return filter.byId()
    case 'creationTime':
    case 'updateTime': {
      if (!TIME_OPERATORS.has(cond.operator)) {
        throw new Error(`Filtering by ${target} does not support ${cond.operator}`)
      }
      return target === 'creationTime' ? filter.byCreationTime() : filter.byUpdateTime()
    }
    case 'referenceCount':
      if (!COUNT_OPERATORS.has(cond.operator)) {
        throw new Error(`Filtering by reference count does not support ${cond.operator}`)
      }
      return filter.byRefCount(cond.property)
    case 'propertyLength':
      // The second argument switches the builder onto the property's length,
      // which is always an integer regardless of the property's own type.
      return filter.byProperty(cond.property, true)
    default:
      return filter.byProperty(cond.property)
  }
}

function valueFor(cond: FilterCondition): any {
  const target = cond.target ?? 'property'
  if (cond.operator === 'IsNull') {
    return cond.value === 'true' || cond.value === '1'
  }
  if (cond.operator === 'WithinGeoRange') {
    return parseGeoRange(cond.value)
  }
  if (cond.operator === 'ContainsAny' || cond.operator === 'ContainsAll') {
    // id and time filters always take strings/dates; property length takes ints.
    if (target === 'id') return splitList(cond.value)
    if (target === 'creationTime' || target === 'updateTime') return splitList(cond.value)
    if (target === 'propertyLength') return splitList(cond.value).map((v) => coerceScalar(v, 'int'))
    return coerceList(cond)
  }
  if (target === 'propertyLength' || target === 'referenceCount') {
    return coerceScalar(cond.value, 'int')
  }
  if (target === 'id') return cond.value
  if (target === 'creationTime' || target === 'updateTime') {
    return coerceScalar(cond.value, 'date')
  }
  return coerceScalar(cond.value, cond.valueType)
}

/** A condition is only usable once it names what it filters on. */
function usable(cond: FilterCondition): boolean {
  if (!cond.operator) return false
  // A half-filled reference hop would silently widen the filter to the whole
  // collection, so treat the condition as incomplete until the hop names one.
  if ((cond.referencePath ?? []).some((hop) => !hop.property)) return false
  const target = cond.target ?? 'property'
  if (target === 'property' || target === 'propertyLength' || target === 'referenceCount') {
    return Boolean(cond.property)
  }
  return true
}

function buildCondition(collection: any, cond: FilterCondition): any {
  const method = PROPERTY_METHOD[cond.operator]
  if (!method) throw new Error(`Unsupported filter operator: ${cond.operator}`)
  const builder = builderFor(collection, cond)
  const fn = builder[method]
  if (typeof fn !== 'function') {
    throw new Error(`Filter target does not support ${cond.operator}`)
  }
  return fn.call(builder, valueFor(cond))
}

function buildNode(collection: any, Filters: any, node: FilterNode): any | undefined {
  if (isGroup(node)) {
    const children = node.children
      .map((child) => buildNode(collection, Filters, child))
      .filter((f) => f !== undefined)
    if (children.length === 0) return undefined
    if (children.length === 1) return children[0]
    return node.operator === 'Or' ? Filters.or(...children) : Filters.and(...children)
  }
  if (!usable(node)) return undefined
  return buildCondition(collection, node)
}

/**
 * Weaviate builds that aggregate over REST cannot express a single-target
 * reference filter: the client refuses to serialize one and answers in terms of
 * its own API. Newer builds aggregate over gRPC and take it happily, so this
 * translates the refusal only when it actually happens rather than ruling the
 * filter out up front.
 */
export function referenceFilterUnsupported(message: string): string | undefined {
  if (!/byRef\(\)/i.test(message)) return undefined
  return 'This Weaviate version cannot aggregate through a single-target reference filter. Set the target collection on that reference filter — the multi-target form is the one its aggregate API accepts.'
}

/**
 * Build a Weaviate filter from the UI's condition tree. Top-level nodes are
 * ANDed together, matching how the builder presents them. Returns undefined
 * when nothing usable was supplied, so callers can omit `filters` entirely.
 *
 * `collection` is a weaviate Collection; `Filters` is the client's Filters class.
 */
export function buildFilter(
  collection: any,
  Filters: any,
  nodes: FilterNode[] | undefined
): any | undefined {
  if (!nodes || nodes.length === 0) return undefined
  const built = nodes
    .map((node) => buildNode(collection, Filters, node))
    .filter((f) => f !== undefined)
  if (built.length === 0) return undefined
  return built.length === 1 ? built[0] : Filters.and(...built)
}
