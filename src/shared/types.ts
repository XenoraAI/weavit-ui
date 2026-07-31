// Shared IPC contract types used by both the Electron main process and the
// React renderer. Keep this file free of any Node or DOM imports so it can be
// consumed from either side.

export type ConnectionType = 'local' | 'cloud' | 'custom'
export type AuthType = 'none' | 'apiKey'

/** A saved connection profile. The API key (if any) is stored separately and
 *  encrypted via Electron safeStorage — it never lives in this object. */
export interface ConnectionConfig {
  id: string
  name: string
  type: ConnectionType
  authType: AuthType
  /** Environment accent color (hex). Threads through the sidebar + status bar
   *  so the active environment is unmistakable. Undefined = default accent. */
  color?: string
  /** Extra HTTP headers, e.g. third-party vectorizer keys like X-OpenAI-Api-Key. */
  headers?: Record<string, string>

  // type: 'local'
  localHost?: string // default 'localhost'
  localPort?: number // default 8080
  localGrpcPort?: number // default 50051

  // type: 'cloud' (Weaviate Cloud)
  clusterUrl?: string // e.g. https://my-cluster.c0.region.gcp.weaviate.cloud

  // type: 'custom'
  httpHost?: string
  httpPort?: number
  httpSecure?: boolean
  grpcHost?: string
  grpcPort?: number
  grpcSecure?: boolean
}

/** Whether a saved connection currently has an API key stored. */
export interface ConnectionWithSecretFlag extends ConnectionConfig {
  hasApiKey: boolean
}

export interface WeaviateMeta {
  version?: string
  hostname?: string
  modules?: Record<string, unknown>
}

export interface TestResult {
  ok: boolean
  meta?: WeaviateMeta
  error?: string
}

export interface ConnectResult {
  ok: boolean
  meta?: WeaviateMeta
  error?: string
}

// ── Schema / collections ────────────────────────────────────────────────────

export interface PropertyConfig {
  name: string
  dataType: string[]
  description?: string
  tokenization?: string
  indexFilterable?: boolean
  indexSearchable?: boolean
  nestedProperties?: PropertyConfig[]
}

export interface CollectionSummary {
  name: string
  description?: string
  vectorizer?: string
  propertyCount: number
  multiTenancyEnabled: boolean
}

/** Full collection config, passed through mostly as-returned by the client. */
export interface CollectionConfig {
  name: string
  description?: string
  properties: PropertyConfig[]
  vectorizer?: string
  vectorIndexType?: string
  multiTenancy: { enabled: boolean; autoTenantCreation?: boolean }
  replication?: { factor?: number }
  sharding?: Record<string, unknown>
  /** The raw config object for the "raw JSON" view. */
  raw: unknown
}

export interface TenantInfo {
  name: string
  activityStatus?: string
}

// ── Data objects ────────────────────────────────────────────────────────────

export interface WeaviateObject {
  uuid: string
  properties: Record<string, unknown>
  metadata?: Record<string, unknown>
  vectors?: Record<string, number[]>
  references?: Record<string, unknown>
}

export interface FetchObjectsRequest {
  connectionId: string
  collection: string
  limit: number
  offset: number
  tenant?: string
  includeVector: boolean
}

export interface FetchObjectsResult {
  objects: WeaviateObject[]
  /** Total object count in the collection (from aggregate), if available. */
  totalCount?: number
}

export interface InsertObjectRequest {
  connectionId: string
  collection: string
  properties: Record<string, unknown>
  id?: string
  vector?: number[]
  tenant?: string
}

export interface UpdateObjectRequest {
  connectionId: string
  collection: string
  id: string
  properties: Record<string, unknown>
  tenant?: string
  /** true = merge (PATCH-style), false = full replace. */
  merge: boolean
}

export interface DeleteObjectRequest {
  connectionId: string
  collection: string
  id: string
  tenant?: string
}

// ── Search / query ──────────────────────────────────────────────────────────

export type SearchType = 'fetch' | 'nearText' | 'nearVector' | 'bm25' | 'hybrid'

export type FilterOperator =
  | 'Equal'
  | 'NotEqual'
  | 'GreaterThan'
  | 'GreaterThanEqual'
  | 'LessThan'
  | 'LessThanEqual'
  | 'Like'
  | 'ContainsAny'
  | 'ContainsAll'

export interface FilterCondition {
  property: string
  operator: FilterOperator
  /** Raw string value; coerced to number/boolean/array in main based on type. */
  value: string
  valueType: 'text' | 'int' | 'number' | 'boolean'
}

export interface SearchRequest {
  connectionId: string
  collection: string
  type: SearchType
  tenant?: string
  limit: number
  includeVector: boolean
  /** For nearText / bm25 / hybrid. */
  queryText?: string
  /** For nearVector — JSON array of numbers as a string. */
  queryVector?: string
  /** Hybrid alpha (0 = pure keyword, 1 = pure vector). */
  alpha?: number
  /** Named vector to target (multi-vector collections). */
  targetVector?: string
  /** Properties to return (empty = all). */
  returnProperties?: string[]
  filters: FilterCondition[]
}

export interface SearchResult {
  objects: WeaviateObject[]
  took?: number
}

export interface AggregateResult {
  totalCount: number
}

// ── Raw consoles ────────────────────────────────────────────────────────────

export interface RawGraphQLRequest {
  connectionId: string
  query: string
}

export interface RawRestRequest {
  connectionId: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string // e.g. /v1/meta
  body?: string // raw JSON string
}

export interface RawResponse {
  status: number
  ok: boolean
  data: unknown
}

export interface NodesResult {
  nodes: unknown[]
}

// ── The full typed IPC surface exposed on window.api ─────────────────────────

export interface WeftApi {
  connections: {
    list(): Promise<ConnectionWithSecretFlag[]>
    upsert(config: ConnectionConfig, apiKey?: string | null): Promise<ConnectionWithSecretFlag>
    remove(id: string): Promise<void>
    test(id: string): Promise<TestResult>
    connect(id: string): Promise<ConnectResult>
    disconnect(id: string): Promise<void>
  }
  schema: {
    listCollections(connectionId: string): Promise<CollectionSummary[]>
    getCollection(connectionId: string, name: string): Promise<CollectionConfig>
    createCollection(connectionId: string, definition: unknown): Promise<void>
    deleteCollection(connectionId: string, name: string): Promise<void>
    listTenants(connectionId: string, collection: string): Promise<TenantInfo[]>
  }
  data: {
    fetchObjects(req: FetchObjectsRequest): Promise<FetchObjectsResult>
    getObject(
      connectionId: string,
      collection: string,
      id: string,
      tenant?: string
    ): Promise<WeaviateObject | null>
    insert(req: InsertObjectRequest): Promise<{ uuid: string }>
    update(req: UpdateObjectRequest): Promise<void>
    delete(req: DeleteObjectRequest): Promise<void>
    deleteMany(
      connectionId: string,
      collection: string,
      filters: FilterCondition[],
      tenant?: string
    ): Promise<{ matches: number }>
  }
  query: {
    search(req: SearchRequest): Promise<SearchResult>
    aggregate(connectionId: string, collection: string, tenant?: string): Promise<AggregateResult>
    rawGraphQL(req: RawGraphQLRequest): Promise<RawResponse>
    rawRest(req: RawRestRequest): Promise<RawResponse>
  }
  admin: {
    getMeta(connectionId: string): Promise<WeaviateMeta>
    getNodes(connectionId: string): Promise<NodesResult>
  }
}
