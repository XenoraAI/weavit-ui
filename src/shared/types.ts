// Shared IPC contract types used by both the Electron main process and the
// React renderer. Keep this file free of any Node or DOM imports so it can be
// consumed from either side.

export type ConnectionType = 'local' | 'cloud' | 'custom'
/** How the app authenticates. The OIDC flavours map onto the client's
 *  AuthUserPasswordCredentials / AuthClientCredentials / AuthAccessTokenCredentials. */
export type AuthType = 'none' | 'apiKey' | 'oidcPassword' | 'oidcClientCredentials' | 'oidcToken'

/** Per-request timeouts (seconds), mirroring the client's TimeoutParams. */
export interface TimeoutConfig {
  init?: number
  query?: number
  insert?: number
}

export interface ProxyConfig {
  http?: string
  grpc?: string
}

/** A saved connection profile. Secrets (API key, password, client secret,
 *  access/refresh token) are stored separately and encrypted via Electron
 *  safeStorage — they never live in this object. */
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
  /** Request timeouts in seconds. */
  timeout?: TimeoutConfig
  /** Forwarding/tunnelling proxies. */
  proxies?: ProxyConfig
  /** Skip the client's startup version/health probes. */
  skipInitChecks?: boolean

  // authType: 'oidcPassword'
  oidcUsername?: string
  // authType: 'oidcClientCredentials'
  oidcClientId?: string
  /** OIDC scopes, whitespace-free entries. */
  oidcScopes?: string[]

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

/** Whether a saved connection currently has a secret stored. */
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

/** Liveness/readiness plus the parsed server version. */
export interface HealthResult {
  live: boolean
  ready: boolean
  version?: string
}

// ── Schema / collections ────────────────────────────────────────────────────

export interface PropertyConfig {
  name: string
  dataType: string[]
  description?: string
  tokenization?: string
  indexFilterable?: boolean
  indexSearchable?: boolean
  indexRangeFilters?: boolean
  nestedProperties?: PropertyConfig[]
}

/** A cross-reference property — dataType holds the target collection name(s). */
export interface ReferenceConfig {
  name: string
  targetCollections: string[]
  description?: string
}

/** One named vector space on a collection. */
export interface NamedVectorConfig {
  name: string
  vectorizer?: string
  indexType?: string
  /** hnsw / flat / dynamic tuning params, passed through verbatim. */
  indexConfig?: Record<string, unknown>
  /** pq / bq / sq / rq settings if quantization is enabled. */
  quantizer?: { type: string; config?: Record<string, unknown> }
  sourceProperties?: string[]
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
  references: ReferenceConfig[]
  vectorizer?: string
  vectorIndexType?: string
  /** Every named vector space, including the implicit default one. */
  namedVectors: NamedVectorConfig[]
  generative?: string
  reranker?: string
  multiTenancy: { enabled: boolean; autoTenantCreation?: boolean; autoTenantActivation?: boolean }
  replication?: { factor?: number; asyncEnabled?: boolean }
  sharding?: Record<string, unknown>
  invertedIndex?: Record<string, unknown>
  /** The raw config object for the "raw JSON" view. */
  raw: unknown
}

export type TenantActivityStatus = 'ACTIVE' | 'INACTIVE' | 'OFFLOADED'

export interface TenantInfo {
  name: string
  activityStatus?: string
}

export interface ShardStatus {
  name: string
  status: string
  vectorQueueSize?: number
}

export type InvertedIndexName = 'filterable' | 'searchable' | 'rangeFilters'

// ── Aliases ─────────────────────────────────────────────────────────────────

export interface AliasInfo {
  alias: string
  collection: string
}

// ── Data objects ────────────────────────────────────────────────────────────

/** A single vector, or a multi-vector (ColBERT-style) list of vectors. */
export type VectorValue = number[] | number[][]

export interface WeaviateObject {
  uuid: string
  properties: Record<string, unknown>
  metadata?: Record<string, unknown>
  vectors?: Record<string, VectorValue>
  references?: Record<string, unknown>
}

export type SortDirection = 'asc' | 'desc'

export interface SortSpec {
  /** Property name, or one of the metadata pseudo-fields below. */
  property: string
  direction: SortDirection
}

/** Metadata pseudo-properties accepted anywhere a sort property is. */
export const SORT_METADATA = ['_id', '_creationTime', '_updateTime'] as const

export interface FetchObjectsRequest {
  connectionId: string
  collection: string
  limit: number
  offset: number
  tenant?: string
  includeVector: boolean
  /** Fetch only these named vectors; empty or absent means every one of them. */
  vectorNames?: string[]
  /** Opaque cursor from a previous page; when set, `offset` is ignored.
   *  Cursor paging stays fast past the depth where offset degrades. */
  after?: string
  sort?: SortSpec[]
  filters?: FilterNode[]
  consistencyLevel?: ConsistencyLevel
  /** Reference properties to resolve alongside each object. */
  returnReferences?: ReferenceRequest[]
}

export interface FetchObjectsResult {
  objects: WeaviateObject[]
  /** Total object count in the collection (from aggregate), if available. */
  totalCount?: number
  /** Why totalCount is missing, when it is. */
  totalCountError?: string
  /** Cursor to pass as `after` for the next page; undefined at the end. */
  nextCursor?: string
}

/** Which reference property to resolve, and what to pull back from the target. */
export interface ReferenceRequest {
  property: string
  targetCollection?: string
  returnProperties?: string[]
}

export interface InsertObjectRequest {
  connectionId: string
  collection: string
  properties: Record<string, unknown>
  id?: string
  vector?: number[]
  /** Named vectors, when the collection defines more than the default space. */
  vectors?: Record<string, number[]>
  references?: Record<string, string[]>
  tenant?: string
  consistencyLevel?: ConsistencyLevel
}

export interface UpdateObjectRequest {
  connectionId: string
  collection: string
  id: string
  properties: Record<string, unknown>
  vectors?: Record<string, number[]>
  tenant?: string
  /** true = merge (PATCH-style), false = full replace. */
  merge: boolean
  consistencyLevel?: ConsistencyLevel
}

export interface DeleteObjectRequest {
  connectionId: string
  collection: string
  id: string
  tenant?: string
  consistencyLevel?: ConsistencyLevel
}

/** A cross-reference edge: fromUuid.fromProperty -> to. */
export interface ReferenceMutationRequest {
  connectionId: string
  collection: string
  fromUuid: string
  fromProperty: string
  /** Target UUIDs; multi-target refs also need targetCollection. */
  to: string[]
  targetCollection?: string
  tenant?: string
}

// ── Bulk import / export ────────────────────────────────────────────────────

export interface ImportObjectsRequest {
  connectionId: string
  collection: string
  tenant?: string
  /** Objects to insert. Each may carry id/vector alongside its properties. */
  objects: ImportObject[]
  /** Rows per batch handed to the client. */
  batchSize?: number
}

export interface ImportObject {
  properties: Record<string, unknown>
  id?: string
  vectors?: Record<string, number[]>
  references?: Record<string, string[]>
}

export interface ImportError {
  index: number
  message: string
}

export interface ImportResult {
  inserted: number
  failed: number
  errors: ImportError[]
  /** UUIDs of successfully written objects, in submission order. */
  uuids: string[]
}

export interface ExportObjectsRequest {
  connectionId: string
  collection: string
  tenant?: string
  includeVector: boolean
  /** Export only these named vectors; empty or absent means every one of them. */
  vectorNames?: string[]
  /** Hard cap so a stray click can't stream a billion-row collection. */
  limit: number
  filters?: FilterNode[]
  /** Reference properties to resolve into each exported object. */
  returnReferences?: ReferenceRequest[]
}

// ── Search / query ──────────────────────────────────────────────────────────

export type SearchType =
  | 'fetch'
  | 'nearText'
  | 'nearVector'
  | 'nearObject'
  | 'nearImage'
  | 'nearMedia'
  | 'bm25'
  | 'hybrid'

/** Media kinds accepted by nearMedia (multi2vec modules). */
export type NearMediaKind = 'audio' | 'depth' | 'image' | 'imu' | 'thermal' | 'video'

export type ConsistencyLevel = 'ALL' | 'ONE' | 'QUORUM'

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
  | 'IsNull'
  | 'WithinGeoRange'

/** What the condition is applied to. Metadata targets map onto the client's
 *  byId / byCreationTime / byUpdateTime / byProperty(...).byLength filters, and
 *  `referenceCount` onto byRefCount. */
export type FilterTarget =
  | 'property'
  | 'propertyLength'
  | 'id'
  | 'creationTime'
  | 'updateTime'
  | 'referenceCount'

export type FilterValueType = 'text' | 'int' | 'number' | 'boolean' | 'date' | 'uuid' | 'geo'

/** One hop along a cross-reference, as `byRef` / `byRefMultiTarget` take it. */
export interface ReferenceHop {
  /** The cross-reference property to follow. */
  property: string
  /** Required only when the reference points at more than one collection. */
  targetCollection?: string
}

export interface FilterCondition {
  kind?: 'condition'
  /** Ignored for the metadata targets. */
  property: string
  target?: FilterTarget
  operator: FilterOperator
  /** Raw string value; coerced in main based on `valueType`.
   *  For ContainsAny/All it is comma-separated.
   *  For WithinGeoRange it is "lat,lon,distanceMeters". */
  value: string
  valueType: FilterValueType
  /**
   * Cross-references to walk before the condition is applied, so the whole
   * condition is evaluated against the referenced object instead of this one.
   * Applies to every target: `property` filters a property of the referenced
   * collection, `id` its UUID, and so on.
   */
  referencePath?: ReferenceHop[]
}

export interface FilterGroup {
  kind: 'group'
  operator: 'And' | 'Or'
  children: FilterNode[]
}

export type FilterNode = FilterCondition | FilterGroup

/** Per-property BM25 weighting, e.g. title^2. */
export interface Bm25Property {
  property: string
  weight?: number
}

export interface GroupBySpec {
  property: string
  numberOfGroups: number
  objectsPerGroup: number
}

export interface RerankSpec {
  property: string
  query?: string
}

/**
 * Maximal marginal relevance: trades some similarity for variety among the
 * results. `balance` is 0 (pure variety) to 1 (pure similarity).
 */
export interface DiversitySpec {
  limit?: number
  balance?: number
}

/** nearText concept steering. */
export interface MoveSpec {
  force: number
  concepts: string[]
  objects?: string[]
}

/** How multiple named vectors are combined in a multi-target search. */
export interface MultiTargetSpec {
  targets: string[]
  join: 'sum' | 'average' | 'minimum' | 'manualWeights' | 'relativeScore'
  /** Only for manualWeights / relativeScore. */
  weights?: Record<string, number>
}

export interface SearchRequest {
  connectionId: string
  collection: string
  type: SearchType
  tenant?: string
  limit: number
  offset?: number
  /** Weaviate autocut: cut results after N score "jumps". */
  autoLimit?: number
  includeVector: boolean
  /** Return only these named vectors; empty or absent means every one of them. */
  vectorNames?: string[]
  consistencyLevel?: ConsistencyLevel
  /** For nearText / bm25 / hybrid. */
  queryText?: string
  /**
   * For nearVector, and optionally for hybrid, where it replaces the vector the
   * server would otherwise compute from `queryText`. A JSON array of numbers, an
   * array of those for a multi-vector (ColBERT) space, or an object keyed by
   * vector name.
   */
  queryVector?: string
  /** For nearObject — the source object's UUID. */
  queryObjectId?: string
  /** For nearImage / nearMedia — base64 payload (no data: prefix). */
  queryMedia?: string
  mediaKind?: NearMediaKind
  /** Hybrid alpha (0 = pure keyword, 1 = pure vector). */
  alpha?: number
  fusionType?: 'Ranked' | 'RelativeScore'
  /** Hybrid: drop vector matches beyond this distance. */
  maxVectorDistance?: number
  /** BM25/hybrid keyword scoring fields, optionally weighted. */
  queryProperties?: Bm25Property[]
  bm25Operator?: { operator: 'and' | 'or'; minimumMatch?: number }
  /** Vector-distance thresholds; mutually exclusive in practice. */
  distance?: number
  certainty?: number
  moveTo?: MoveSpec
  moveAway?: MoveSpec
  /** Named vector to target (multi-vector collections). */
  targetVector?: string
  multiTarget?: MultiTargetSpec
  sort?: SortSpec[]
  groupBy?: GroupBySpec
  rerank?: RerankSpec
  /** Spread the results out instead of returning near-duplicates. */
  diversity?: DiversitySpec
  /** Correlates a running search with a later cancel. */
  requestId?: string
  /** Properties to return (empty = all). */
  returnProperties?: string[]
  returnReferences?: ReferenceRequest[]
  filters: FilterNode[]
}

/** One group when `groupBy` was requested. */
export interface SearchGroup {
  name: string
  numberOfObjects: number
  minDistance?: number
  maxDistance?: number
  objects: WeaviateObject[]
}

export interface SearchResult {
  objects: WeaviateObject[]
  groups?: SearchGroup[]
  took?: number
}

// ── Generative search (RAG) ─────────────────────────────────────────────────

/**
 * Providers that can be named at query time. These are spelled exactly as the
 * client's `generativeParameters` factories so the main process can look one up
 * directly rather than keeping a mapping table that drifts from the SDK.
 */
export type GenerativeProvider =
  | 'anthropic'
  | 'anyscale'
  | 'aws'
  | 'azureOpenAI'
  | 'cohere'
  | 'contextualai'
  | 'databricks'
  | 'friendliai'
  | 'google'
  | 'mistral'
  | 'nvidia'
  | 'ollama'
  | 'openAI'
  | 'xai'

export interface GenerateRequest {
  /** Everything about retrieval is shared with a normal search. */
  search: SearchRequest
  /** Prompt run once per returned object; `{property}` interpolates. */
  singlePrompt?: string
  /** Prompt run once over the whole result set. */
  groupedTask?: string
  /** Properties fed as context into the grouped task. */
  groupedProperties?: string[]
  /**
   * Names the LLM to call for this one query, overriding whatever the
   * collection has in `moduleConfig`. Without it Weaviate falls back to the
   * collection's configured generative module, and fails with "empty provider"
   * if there isn't one. Requires Weaviate 1.30+ and the module enabled server
   * side; the credential still comes from a connection header.
   */
  provider?: GenerativeProvider
  /** Model id for the chosen provider; the provider's own default when unset. */
  model?: string
  /** Sampling temperature, passed through untouched when set. */
  temperature?: number
  /** Upper bound on generated tokens. */
  maxTokens?: number
  /** Nucleus sampling cutoff. */
  topP?: number
  /** Sequences that end generation. */
  stop?: string[]
  /** Provider base URL — for self-hosted backends such as Ollama. */
  baseUrl?: string
  /** Azure OpenAI addresses a deployment rather than a model, so it needs all
   *  three of these; other providers ignore them. */
  resourceName?: string
  deploymentId?: string
  apiVersion?: string
  /** Ask the provider to report token usage alongside the text. */
  returnMetadata?: boolean
  /** Ask Weaviate for the prompt it actually sent, after interpolation. */
  debug?: boolean
  /** Properties holding images to send to a multimodal model. */
  imageProperties?: string[]
}

/** Token accounting, when the provider reports it and `returnMetadata` was set. */
export interface GenerativeUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface GenerateResult {
  /** The retrieved objects, each with its own generation under `generated`. */
  objects: (WeaviateObject & {
    generated?: string
    /** The interpolated prompt, when `debug` was requested. */
    debugPrompt?: string
    usage?: GenerativeUsage
  })[]
  /** The grouped-task output, when one was requested. */
  generated?: string
  /** Groups, when retrieval used `groupBy`; each may carry its own generation. */
  groups?: (SearchGroup & { generated?: string })[]
  /** Token usage for the grouped task. */
  usage?: GenerativeUsage
  took?: number
}

// ── Aggregation ─────────────────────────────────────────────────────────────

export interface AggregateResult {
  totalCount: number
}

export type PropertyMetricKind = 'text' | 'integer' | 'number' | 'boolean' | 'date'

/** Per-property aggregation, shape depending on the property's kind. */
export interface PropertyStats {
  property: string
  kind: PropertyMetricKind
  count?: number
  minimum?: number | string
  maximum?: number | string
  mean?: number
  median?: number | string
  mode?: number | string
  sum?: number
  totalTrue?: number
  totalFalse?: number
  percentageTrue?: number
  percentageFalse?: number
  topOccurrences?: { value?: string; occurs?: number }[]
}

/**
 * Search kinds an aggregation can be scoped to. Weaviate's aggregate API takes
 * the near-* family and hybrid, but not bm25 or nearMedia.
 */
export type AggregateSearchType =
  | 'nearText'
  | 'nearVector'
  | 'nearObject'
  | 'nearImage'
  | 'hybrid'

/**
 * Narrows an aggregation to the objects a search matches, rather than the whole
 * collection — "what do the top 100 results for this query look like".
 */
export interface AggregateSearchSpec {
  type: AggregateSearchType
  /** For nearText / hybrid. */
  queryText?: string
  /**
   * For nearVector, and optionally for hybrid, where it replaces the vector the
   * server would otherwise compute from `queryText`. A JSON array of numbers, an
   * array of those for a multi-vector (ColBERT) space, or an object keyed by
   * vector name.
   */
  queryVector?: string
  /** For nearObject — the source object's UUID. */
  queryObjectId?: string
  /** For nearImage — base64 payload (no data: prefix). */
  queryMedia?: string
  /** How many matched objects feed the aggregation. */
  objectLimit?: number
  /** Vector-distance thresholds; mutually exclusive in practice. */
  distance?: number
  certainty?: number
  targetVector?: string
  /** Hybrid alpha (0 = pure keyword, 1 = pure vector). */
  alpha?: number
  /** Hybrid: drop vector matches beyond this distance. */
  maxVectorDistance?: number
  /** Hybrid keyword scoring fields, optionally weighted. */
  queryProperties?: Bm25Property[]
}

export interface CollectionStatsRequest {
  connectionId: string
  collection: string
  tenant?: string
  /** Restrict to these properties; empty = every aggregatable property. */
  properties?: string[]
  /** Optionally break the counts down by this property. */
  groupBy?: string
  filters?: FilterNode[]
  /** Aggregate over a search's matches instead of the whole collection. */
  search?: AggregateSearchSpec
}

export interface StatsGroup {
  value: string
  count: number
}

export interface CollectionStatsResult {
  totalCount: number
  properties: PropertyStats[]
  groups?: StatsGroup[]
  /** Properties that could not be aggregated, with the server's reason. */
  skipped: { property: string; reason: string }[]
}

// ── Backup ──────────────────────────────────────────────────────────────────

export type BackupBackend = 'filesystem' | 's3' | 'gcs' | 'azure'
export type BackupStatus = 'STARTED' | 'TRANSFERRING' | 'TRANSFERRED' | 'SUCCESS' | 'FAILED' | 'CANCELED'
export type BackupCompressionLevel =
  | 'DefaultCompression'
  | 'BestSpeed'
  | 'BestCompression'
  | 'ZstdBestSpeed'
  | 'ZstdDefaultCompression'
  | 'ZstdBestCompression'
  | 'NoCompression'

export interface BackupRequest {
  connectionId: string
  backupId: string
  backend: BackupBackend
  includeCollections?: string[]
  excludeCollections?: string[]
  /** The UI always polls, so this stays false and the call returns promptly. */
  waitForCompletion?: boolean
  compressionLevel?: BackupCompressionLevel
  cpuPercentage?: number
  /** Restore only: let the restore replace a conflicting alias. */
  overwriteAlias?: boolean
}

export interface BackupStatusRequest {
  connectionId: string
  backupId: string
  backend: BackupBackend
}

export interface BackupCancelRequest extends BackupStatusRequest {
  operation?: 'create' | 'restore'
}

export interface BackupInfo {
  id: string
  status: BackupStatus
  path?: string
  error?: string
  backend?: BackupBackend
  collections?: string[]
  startedAt?: string
  completedAt?: string
  size?: number
}

/** Listing a backend that the server has no module for is a configuration
 *  answer, not a failure — so it is reported rather than thrown. */
export interface BackupListResult {
  backups: BackupInfo[]
  /** False when this backend is not enabled on the server. */
  available: boolean
  /** The server's explanation, when the backend is unavailable. */
  reason?: string
}

// ── RBAC ────────────────────────────────────────────────────────────────────

/** A permission as the UI models it: one action group scoped to a resource. */
export interface RolePermission {
  /** e.g. 'collections', 'data', 'backups', 'cluster', 'nodes', 'roles',
   *  'tenants', 'users', 'aliases', 'replicate', 'groups', 'mcp'. */
  resource: string
  /** The verbs granted, as returned by the server (e.g. 'read', 'create'). */
  actions: string[]
  collection?: string
  tenant?: string
  alias?: string
  role?: string
  user?: string
  group?: string
  /** Anything the server sent that the UI doesn't model. */
  raw?: unknown
}

export interface RoleInfo {
  name: string
  permissions: RolePermission[]
}

/**
 * Predefined roles Weaviate protects: it refuses to assign, revoke or modify
 * them, answering 403 "modifying '<role>' role ... is not allowed". `read-only`
 * is a legacy alias of `viewer` and is locked; `viewer` is the assignable one.
 * Best-effort — the server is still the authority, so callers must handle a
 * refusal for a role that isn't on this list.
 */
export const LOCKED_ROLES: readonly string[] = ['root', 'read-only']

export function isLockedRole(role: string): boolean {
  return LOCKED_ROLES.includes(role)
}

/**
 * A snapshot of what the connected user may do, derived from the roles they
 * hold. `resolved` is true only when every one of those roles was read and
 * fully understood; anything else — no RBAC on the instance, roles the key
 * can't read, a permission kind this build doesn't model — leaves it false.
 *
 * An unresolved snapshot means "allow everything". The server is the authority
 * on access, so a snapshot is only ever a way to explain a refusal before it
 * happens; guessing "deny" would lock a user out of something they can really
 * do, which is worse than the refusal it was trying to save them.
 */
export interface Capabilities {
  resolved: boolean
  userId?: string
  roles: string[]
  /** Every permission across every role held, flattened. */
  permissions: RolePermission[]
  /** Why the snapshot is unresolved — worth showing as fine print. */
  note?: string
}

export type UserKind = 'db_user' | 'db_env_user' | 'oidc'

export interface UserInfo {
  id: string
  kind?: UserKind
  active?: boolean
  roles: string[]
  createdAt?: string
  lastUsedAt?: string
}

export interface RoleAssignments {
  users: { userId: string; userType: string }[]
  groups: { groupId: string; groupType: string }[]
}

/** The permission payload the UI sends when granting/revoking. */
export interface PermissionInput {
  resource: string
  /** Verb -> granted. Verb names match the SDK's permission builders. */
  actions: Record<string, boolean>
  collection?: string
  tenant?: string
  alias?: string
  role?: string
  user?: string
  group?: string
  verbosity?: 'minimal' | 'verbose'
}

// ── Cluster ─────────────────────────────────────────────────────────────────

export interface NodeShardInfo {
  name: string
  class: string
  objectCount?: number
  vectorIndexingStatus?: string
  vectorQueueLength?: number
  compressed?: boolean
  loaded?: boolean
}

export interface ClusterNodeInfo {
  name: string
  status: string
  version?: string
  gitHash?: string
  shards: NodeShardInfo[]
  stats?: { shardCount?: number; objectCount?: number }
  batchStats?: Record<string, unknown>
}

/**
 * Replica movement is an optional part of the cluster API: it needs Weaviate
 * 1.32+ and a cluster that actually has replication configured. Instances
 * without it answer the endpoints with 501/404 rather than an empty list, so
 * the reason travels alongside the data instead of being thrown as an error —
 * "not configured here" is a state to render, not a failure.
 */
export interface ClusterFeatureAvailability {
  available: boolean
  reason?: 'notImplemented' | 'notFound' | 'unauthorized' | 'error'
  /** Whatever the server said, when it said anything. */
  detail?: string
}

export interface ShardingStateResult {
  collection: string
  shards: { shard: string; replicas: string[] }[]
  availability: ClusterFeatureAvailability
}

export type ReplicationType = 'COPY' | 'MOVE'

export interface ReplicateRequest {
  connectionId: string
  collection: string
  shard: string
  sourceNode: string
  targetNode: string
  replicationType: ReplicationType
}

export interface ReplicationOp {
  id: string
  collection?: string
  shard?: string
  sourceNode?: string
  targetNode?: string
  status?: string
  type?: string
  raw?: unknown
}

export interface ReplicationListResult {
  ops: ReplicationOp[]
  availability: ClusterFeatureAvailability
}

// ── Tokenizer preview ───────────────────────────────────────────────────────

export interface TokenizeRequest {
  connectionId: string
  text: string
  /** Either a raw tokenization strategy, or a collection+property to borrow one. */
  tokenization?: string
  collection?: string
  property?: string
}

export interface TokenizeResult {
  /** Tokens as they are written into the inverted index. */
  tokens: string[]
  /** Tokens a query is reduced to — stopwords are dropped here but not above. */
  queryTokens?: string[]
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

// ── Query history / saved queries ───────────────────────────────────────────

export interface HistoryEntry {
  id: string
  connectionId: string
  collection: string
  /** ISO timestamp. */
  at: string
  request: SearchRequest
  /** Result count, for at-a-glance recall. */
  resultCount?: number
}

export interface SavedQuery {
  id: string
  name: string
  connectionId?: string
  collection: string
  request: SearchRequest
  savedAt: string
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
    getCollectionSchema(connectionId: string, name: string): Promise<unknown>
    createCollection(connectionId: string, definition: unknown): Promise<void>
    /** Merges `patch` into the current definition unless `replace` is set. */
    updateCollection(
      connectionId: string,
      name: string,
      patch: Record<string, unknown>,
      replace?: boolean
    ): Promise<void>
    addProperty(connectionId: string, name: string, property: unknown): Promise<void>
    addReference(connectionId: string, name: string, reference: unknown): Promise<void>
    addVector(connectionId: string, name: string, vectors: unknown): Promise<void>
    dropInvertedIndex(
      connectionId: string,
      name: string,
      property: string,
      index: InvertedIndexName
    ): Promise<void>
    deleteCollection(connectionId: string, name: string): Promise<void>
    collectionExists(connectionId: string, name: string): Promise<boolean>
    exportSchema(connectionId: string, name?: string): Promise<unknown>
    importSchema(connectionId: string, definition: unknown): Promise<{ created: string[] }>
    getShards(connectionId: string, name: string): Promise<ShardStatus[]>
    updateShards(
      connectionId: string,
      name: string,
      status: 'READY' | 'READONLY',
      shards?: string[]
    ): Promise<ShardStatus[]>
    listTenants(connectionId: string, collection: string): Promise<TenantInfo[]>
  }
  tenants: {
    list(connectionId: string, collection: string): Promise<TenantInfo[]>
    create(connectionId: string, collection: string, names: string[]): Promise<TenantInfo[]>
    remove(connectionId: string, collection: string, names: string[]): Promise<void>
    setStatus(
      connectionId: string,
      collection: string,
      names: string[],
      status: TenantActivityStatus
    ): Promise<TenantInfo[]>
  }
  alias: {
    list(connectionId: string, collection?: string): Promise<AliasInfo[]>
    get(connectionId: string, alias: string): Promise<AliasInfo | null>
    create(connectionId: string, alias: string, collection: string): Promise<void>
    update(connectionId: string, alias: string, newTargetCollection: string): Promise<void>
    delete(connectionId: string, alias: string): Promise<void>
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
      filters: FilterNode[],
      tenant?: string,
      dryRun?: boolean
    ): Promise<{ matches: number; deleted?: number; failed?: number }>
    exists(connectionId: string, collection: string, id: string, tenant?: string): Promise<boolean>
    importObjects(req: ImportObjectsRequest): Promise<ImportResult>
    exportObjects(req: ExportObjectsRequest): Promise<WeaviateObject[]>
    referenceAdd(req: ReferenceMutationRequest): Promise<void>
    referenceReplace(req: ReferenceMutationRequest): Promise<void>
    referenceDelete(req: ReferenceMutationRequest): Promise<void>
  }
  query: {
    search(req: SearchRequest): Promise<SearchResult>
    /** Aborts a running search or generation. False if it already finished. */
    cancel(requestId: string): Promise<boolean>
    aggregate(connectionId: string, collection: string, tenant?: string): Promise<AggregateResult>
    collectionStats(req: CollectionStatsRequest): Promise<CollectionStatsResult>
    generate(req: GenerateRequest): Promise<GenerateResult>
    rawGraphQL(req: RawGraphQLRequest): Promise<RawResponse>
    rawRest(req: RawRestRequest): Promise<RawResponse>
  }
  backup: {
    create(req: BackupRequest): Promise<BackupInfo>
    restore(req: BackupRequest): Promise<BackupInfo>
    createStatus(req: BackupStatusRequest): Promise<BackupInfo>
    restoreStatus(req: BackupStatusRequest): Promise<BackupInfo>
    cancel(req: BackupCancelRequest): Promise<boolean>
    list(connectionId: string, backend: BackupBackend): Promise<BackupListResult>
  }
  rbac: {
    listRoles(connectionId: string): Promise<RoleInfo[]>
    getRole(connectionId: string, role: string): Promise<RoleInfo | null>
    createRole(connectionId: string, role: string, permissions: PermissionInput[]): Promise<void>
    deleteRole(connectionId: string, role: string): Promise<void>
    addPermissions(
      connectionId: string,
      role: string,
      permissions: PermissionInput[]
    ): Promise<void>
    removePermissions(
      connectionId: string,
      role: string,
      permissions: PermissionInput[]
    ): Promise<void>
    roleAssignments(connectionId: string, role: string): Promise<RoleAssignments>
    listUsers(connectionId: string): Promise<UserInfo[]>
    createUser(connectionId: string, userId: string): Promise<{ apiKey: string }>
    deleteUser(connectionId: string, userId: string): Promise<boolean>
    rotateKey(connectionId: string, userId: string): Promise<{ apiKey: string }>
    setUserActive(connectionId: string, userId: string, active: boolean): Promise<boolean>
    assignRoles(connectionId: string, userId: string, roles: string[]): Promise<void>
    revokeRoles(connectionId: string, userId: string, roles: string[]): Promise<void>
    getMyUser(connectionId: string): Promise<UserInfo>
    getCapabilities(connectionId: string): Promise<Capabilities>
    listGroups(connectionId: string): Promise<string[]>
    groupRoles(connectionId: string, groupId: string): Promise<string[]>
    assignGroupRoles(connectionId: string, groupId: string, roles: string[]): Promise<void>
    revokeGroupRoles(connectionId: string, groupId: string, roles: string[]): Promise<void>
  }
  cluster: {
    nodes(connectionId: string, collection?: string): Promise<ClusterNodeInfo[]>
    shardingState(connectionId: string, collection: string): Promise<ShardingStateResult>
    replicate(req: ReplicateRequest): Promise<{ id: string }>
    listReplications(connectionId: string, collection?: string): Promise<ReplicationListResult>
    cancelReplication(connectionId: string, id: string): Promise<void>
    deleteReplication(connectionId: string, id: string): Promise<void>
  }
  admin: {
    getMeta(connectionId: string): Promise<WeaviateMeta>
    getNodes(connectionId: string): Promise<NodesResult>
    health(connectionId: string): Promise<HealthResult>
    tokenize(req: TokenizeRequest): Promise<TokenizeResult>
  }
  history: {
    list(connectionId: string, collection?: string): Promise<HistoryEntry[]>
    record(entry: Omit<HistoryEntry, 'id' | 'at'>): Promise<HistoryEntry>
    clear(connectionId?: string): Promise<void>
    listSaved(): Promise<SavedQuery[]>
    save(query: Omit<SavedQuery, 'id' | 'savedAt'>): Promise<SavedQuery>
    deleteSaved(id: string): Promise<void>
  }
}
