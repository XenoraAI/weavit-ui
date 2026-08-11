import type { FilterCondition, FilterNode, SearchRequest } from '@shared/types'

// Turns the query panel's state into the equivalent client code. The point is
// to make the app a way of learning the SDK, not just of driving it — you build
// a query in the UI, then paste the same query into your own project.

export type CodeLanguage = 'js' | 'python' | 'graphql'

function isGroup(node: FilterNode): node is Extract<FilterNode, { kind: 'group' }> {
  return (node as { kind?: string }).kind === 'group'
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function jsLiteral(cond: FilterCondition): string {
  const list = () =>
    `[${cond.value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => (cond.valueType === 'int' || cond.valueType === 'number' ? v : quote(v)))
      .join(', ')}]`

  if (cond.operator === 'ContainsAny' || cond.operator === 'ContainsAll') return list()
  if (cond.operator === 'IsNull') return String(cond.value === 'true')
  switch (cond.valueType) {
    case 'int':
    case 'number':
      return cond.value || '0'
    case 'boolean':
      return String(cond.value === 'true')
    case 'date':
      return `new Date(${quote(cond.value)})`
    default:
      return quote(cond.value)
  }
}

const JS_FILTER_METHOD: Record<string, string> = {
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

function jsFilterTarget(cond: FilterCondition): string {
  switch (cond.target ?? 'property') {
    case 'id':
      return 'collection.filter.byId()'
    case 'creationTime':
      return 'collection.filter.byCreationTime()'
    case 'updateTime':
      return 'collection.filter.byUpdateTime()'
    case 'propertyLength':
      return `collection.filter.byProperty(${quote(cond.property)}, true)`
    default:
      return `collection.filter.byProperty(${quote(cond.property)})`
  }
}

function jsFilter(node: FilterNode): string | undefined {
  if (isGroup(node)) {
    const children = node.children.map(jsFilter).filter(Boolean) as string[]
    if (children.length === 0) return undefined
    if (children.length === 1) return children[0]
    return `Filters.${node.operator === 'Or' ? 'or' : 'and'}(${children.join(', ')})`
  }
  const method = JS_FILTER_METHOD[node.operator]
  if (!method) return undefined
  return `${jsFilterTarget(node)}.${method}(${jsLiteral(node)})`
}

function jsFilters(nodes: FilterNode[]): string | undefined {
  const built = nodes.map(jsFilter).filter(Boolean) as string[]
  if (built.length === 0) return undefined
  return built.length === 1 ? built[0] : `Filters.and(${built.join(', ')})`
}

/** The options object, rendered one key per line for readability. */
function jsOptions(req: SearchRequest): string[] {
  const lines: string[] = [`limit: ${req.limit}`]
  if (req.offset) lines.push(`offset: ${req.offset}`)
  if (req.autoLimit) lines.push(`autoLimit: ${req.autoLimit}`)
  if (req.includeVector) lines.push('includeVector: true')
  if (req.returnProperties?.length) {
    lines.push(`returnProperties: [${req.returnProperties.map(quote).join(', ')}]`)
  }
  if (req.targetVector) lines.push(`targetVector: ${quote(req.targetVector)}`)
  if (req.distance != null) lines.push(`distance: ${req.distance}`)
  else if (req.certainty != null) lines.push(`certainty: ${req.certainty}`)
  if (req.type === 'hybrid') {
    lines.push(`alpha: ${req.alpha ?? 0.5}`)
    if (req.fusionType) lines.push(`fusionType: ${quote(req.fusionType)}`)
    if (req.maxVectorDistance != null) lines.push(`maxVectorDistance: ${req.maxVectorDistance}`)
  }
  if ((req.type === 'bm25' || req.type === 'hybrid') && req.queryProperties?.length) {
    const props = req.queryProperties.map((p) =>
      quote(p.weight != null && p.weight !== 1 ? `${p.property}^${p.weight}` : p.property)
    )
    lines.push(`queryProperties: [${props.join(', ')}]`)
  }
  if (req.rerank?.property) {
    lines.push(
      `rerank: { property: ${quote(req.rerank.property)}, query: ${quote(req.rerank.query ?? req.queryText ?? '')} }`
    )
  }
  if (req.groupBy?.property) {
    lines.push(
      `groupBy: { property: ${quote(req.groupBy.property)}, numberOfGroups: ${req.groupBy.numberOfGroups}, objectsPerGroup: ${req.groupBy.objectsPerGroup} }`
    )
  }
  if (req.type === 'fetch' && req.sort?.length) {
    const chain = req.sort
      .map((s) => `.byProperty(${quote(s.property)}, ${s.direction !== 'desc'})`)
      .join('')
    lines.push(`sort: collection.sort${chain}`)
  }
  const filters = jsFilters(req.filters)
  if (filters) lines.push(`filters: ${filters}`)
  return lines
}

function jsQueryTerm(req: SearchRequest): string {
  switch (req.type) {
    case 'nearVector':
      return `${req.queryVector || '[]'}, `
    case 'nearObject':
      return `${quote(req.queryObjectId ?? '')}, `
    case 'nearImage':
      return 'imageBase64, '
    case 'nearMedia':
      return `mediaBase64, ${quote(req.mediaKind ?? 'image')}, `
    case 'fetch':
      return ''
    default:
      return `${quote(req.queryText ?? '')}, `
  }
}

const JS_METHOD: Record<string, string> = {
  fetch: 'fetchObjects',
  nearText: 'nearText',
  nearVector: 'nearVector',
  nearObject: 'nearObject',
  nearImage: 'nearImage',
  nearMedia: 'nearMedia',
  bm25: 'bm25',
  hybrid: 'hybrid'
}

function toJs(req: SearchRequest): string {
  const usesFilters = Boolean(jsFilters(req.filters))
  const imports = usesFilters
    ? "import weaviate, { Filters } from 'weaviate-client'"
    : "import weaviate from 'weaviate-client'"

  const scope = req.tenant
    ? `.withTenant(${quote(req.tenant)})`
    : ''
  const options = jsOptions(req)
    .map((l) => `  ${l}`)
    .join(',\n')

  return `${imports}

const client = await weaviate.connectToLocal()
const collection = client.collections.get(${quote(req.collection)})${scope}

const result = await collection.query.${JS_METHOD[req.type]}(${jsQueryTerm(req)}{
${options}
})

for (const object of result.objects) {
  console.log(object.uuid, object.properties)
}

await client.close()`
}

const PY_FILTER_METHOD: Record<string, string> = {
  Equal: 'equal',
  NotEqual: 'not_equal',
  GreaterThan: 'greater_than',
  GreaterThanEqual: 'greater_or_equal',
  LessThan: 'less_than',
  LessThanEqual: 'less_or_equal',
  Like: 'like',
  ContainsAny: 'contains_any',
  ContainsAll: 'contains_all',
  IsNull: 'is_none',
  WithinGeoRange: 'within_geo_range'
}

function pyLiteral(cond: FilterCondition): string {
  if (cond.operator === 'ContainsAny' || cond.operator === 'ContainsAll') {
    const items = cond.value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => (cond.valueType === 'int' || cond.valueType === 'number' ? v : quote(v)))
    return `[${items.join(', ')}]`
  }
  if (cond.operator === 'IsNull') return cond.value === 'true' ? 'True' : 'False'
  switch (cond.valueType) {
    case 'int':
    case 'number':
      return cond.value || '0'
    case 'boolean':
      return cond.value === 'true' ? 'True' : 'False'
    default:
      return quote(cond.value)
  }
}

function pyFilter(node: FilterNode): string | undefined {
  if (isGroup(node)) {
    const children = node.children.map(pyFilter).filter(Boolean) as string[]
    if (children.length === 0) return undefined
    if (children.length === 1) return children[0]
    return `(${children.join(node.operator === 'Or' ? ' | ' : ' & ')})`
  }
  const method = PY_FILTER_METHOD[node.operator]
  if (!method) return undefined
  const target =
    node.target === 'id'
      ? 'Filter.by_id()'
      : node.target === 'creationTime'
        ? 'Filter.by_creation_time()'
        : node.target === 'updateTime'
          ? 'Filter.by_update_time()'
          : `Filter.by_property(${quote(node.property)})`
  return `${target}.${method}(${pyLiteral(node)})`
}

function toPython(req: SearchRequest): string {
  const filters = req.filters.map(pyFilter).filter(Boolean) as string[]
  const filterExpr =
    filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : `(${filters.join(' & ')})`

  const args: string[] = []
  if (req.type !== 'fetch') {
    if (req.type === 'nearVector') args.push(`near_vector=${req.queryVector || '[]'}`)
    else if (req.type === 'nearObject') args.push(`near_object=${quote(req.queryObjectId ?? '')}`)
    else args.push(`query=${quote(req.queryText ?? '')}`)
  }
  args.push(`limit=${req.limit}`)
  if (req.offset) args.push(`offset=${req.offset}`)
  if (req.autoLimit) args.push(`auto_limit=${req.autoLimit}`)
  if (req.type === 'hybrid') args.push(`alpha=${req.alpha ?? 0.5}`)
  if (req.distance != null) args.push(`distance=${req.distance}`)
  if (req.returnProperties?.length) {
    args.push(`return_properties=[${req.returnProperties.map(quote).join(', ')}]`)
  }
  if (req.includeVector) args.push('include_vector=True')
  if (req.targetVector) args.push(`target_vector=${quote(req.targetVector)}`)
  if (filterExpr) args.push(`filters=${filterExpr}`)

  const method =
    req.type === 'fetch'
      ? 'fetch_objects'
      : req.type === 'nearText'
        ? 'near_text'
        : req.type === 'nearVector'
          ? 'near_vector'
          : req.type === 'nearObject'
            ? 'near_object'
            : req.type

  const tenantLine = req.tenant
    ? `collection = collection.with_tenant(${quote(req.tenant)})\n`
    : ''

  return `import weaviate
from weaviate.classes.query import Filter

client = weaviate.connect_to_local()
collection = client.collections.get(${quote(req.collection)})
${tenantLine}
response = collection.query.${method}(
    ${args.join(',\n    ')}
)

for obj in response.objects:
    print(obj.uuid, obj.properties)

client.close()`
}

/** GraphQL is the wire format, so it is the most faithful of the three. */
function toGraphQL(req: SearchRequest): string {
  const props = req.returnProperties?.length ? req.returnProperties : ['# pick properties']
  const args: string[] = [`limit: ${req.limit}`]
  if (req.offset) args.push(`offset: ${req.offset}`)
  if (req.tenant) args.push(`tenant: ${quote(req.tenant)}`)

  switch (req.type) {
    case 'nearText':
      args.push(`nearText: { concepts: [${quote(req.queryText ?? '')}] }`)
      break
    case 'bm25':
      args.push(`bm25: { query: ${quote(req.queryText ?? '')} }`)
      break
    case 'hybrid':
      args.push(`hybrid: { query: ${quote(req.queryText ?? '')}, alpha: ${req.alpha ?? 0.5} }`)
      break
    case 'nearVector':
      args.push(`nearVector: { vector: ${req.queryVector || '[]'} }`)
      break
    case 'nearObject':
      args.push(`nearObject: { id: ${quote(req.queryObjectId ?? '')} }`)
      break
    default:
      break
  }

  const metadata =
    req.type === 'fetch'
      ? '      id\n      creationTimeUnix'
      : '      id\n      distance\n      score'

  return `{
  Get {
    ${req.collection}(
      ${args.join('\n      ')}
    ) {
${props.map((p) => `      ${p}`).join('\n')}
      _additional {
${metadata}
      }
    }
  }
}`
}

export function generateCode(req: SearchRequest, language: CodeLanguage): string {
  switch (language) {
    case 'python':
      return toPython(req)
    case 'graphql':
      return toGraphQL(req)
    default:
      return toJs(req)
  }
}
