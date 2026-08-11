import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { CH } from '@shared/channels'
import type {
  BackupBackend,
  BackupCancelRequest,
  BackupRequest,
  BackupStatusRequest,
  CollectionStatsRequest,
  ConnectionConfig,
  ConnectionWithSecretFlag,
  ConnectResult,
  DeleteObjectRequest,
  ExportObjectsRequest,
  FetchObjectsRequest,
  FilterNode,
  GenerateRequest,
  HistoryEntry,
  ImportObjectsRequest,
  InsertObjectRequest,
  InvertedIndexName,
  PermissionInput,
  RawGraphQLRequest,
  RawRestRequest,
  ReferenceMutationRequest,
  ReplicateRequest,
  SavedQuery,
  SearchRequest,
  TenantActivityStatus,
  TestResult,
  TokenizeRequest,
  UpdateObjectRequest
} from '@shared/types'
import {
  clearHistory,
  deleteSavedQuery,
  deleteSecret,
  hasSecret,
  loadConnections,
  loadHistory,
  loadSavedQueries,
  recordHistory,
  saveConnections,
  saveQuery,
  setSecret
} from '../store/store'
import { evictClient, getClient, getConnectionConfig } from '../weaviate/connectionManager'
import * as collections from '../weaviate/collections'
import * as tenants from '../weaviate/tenants'
import * as alias from '../weaviate/alias'
import * as data from '../weaviate/data'
import * as query from '../weaviate/query'
import * as generate from '../weaviate/generate'
import * as backup from '../weaviate/backup'
import * as rbac from '../weaviate/rbac'
import * as permissions from '../weaviate/permissions'
import * as cluster from '../weaviate/cluster'
import * as admin from '../weaviate/admin'
import { errorMessage } from '../util'

function withFlags(list: ConnectionConfig[]): ConnectionWithSecretFlag[] {
  return list.map((c) => ({ ...c, hasApiKey: hasSecret(c.id) }))
}

/**
 * Searches the renderer can still call back to cancel, keyed by the id it
 * generated for the run. A request without an id simply isn't cancellable.
 */
const inFlight = new Map<string, AbortController>()

function cancellable<T>(
  requestId: string | undefined,
  fn: (signal?: AbortSignal) => Promise<T>
): Promise<T> {
  if (!requestId) return fn()
  const controller = new AbortController()
  inFlight.set(requestId, controller)
  return fn(controller.signal).finally(() => inFlight.delete(requestId))
}

// Wrap a handler so thrown errors reach the renderer as a rejected invoke.
function handle<Args extends unknown[], R>(
  channel: string,
  fn: (...args: Args) => Promise<R> | R
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    return fn(...(args as Args))
  })
}

export function registerIpc(): void {
  // ── Connections ───────────────────────────────────────────────────────────
  handle(CH.connections.list, () => withFlags(loadConnections()))

  handle(
    CH.connections.upsert,
    (config: ConnectionConfig, apiKey?: string | null): ConnectionWithSecretFlag => {
      const list = loadConnections()
      const id = config.id || randomUUID()
      const record: ConnectionConfig = { ...config, id }
      const idx = list.findIndex((c) => c.id === id)
      if (idx >= 0) list[idx] = record
      else list.push(record)
      saveConnections(list)
      // apiKey === undefined -> leave existing secret untouched;
      // null/'' -> clear it; string -> set it.
      if (apiKey !== undefined) setSecret(id, apiKey)
      void evictClient(id)
      return { ...record, hasApiKey: hasSecret(id) }
    }
  )

  handle(CH.connections.remove, async (id: string) => {
    const list = loadConnections().filter((c) => c.id !== id)
    saveConnections(list)
    deleteSecret(id)
    clearHistory(id)
    await evictClient(id)
  })

  handle(CH.connections.test, async (id: string): Promise<TestResult> => {
    try {
      getConnectionConfig(id)
      const meta = await admin.getMeta(id)
      return { ok: true, meta }
    } catch (e) {
      return { ok: false, error: errorMessage(e) }
    }
  })

  handle(CH.connections.connect, async (id: string): Promise<ConnectResult> => {
    try {
      const client = await getClient(id)
      // Force a real round-trip over the gRPC/HTTP client.
      await client.collections.listAll()
      const meta = await admin.getMeta(id)
      return { ok: true, meta }
    } catch (e) {
      await evictClient(id)
      return { ok: false, error: errorMessage(e) }
    }
  })

  handle(CH.connections.disconnect, (id: string) => evictClient(id))

  // ── Schema ──────────────────────────────────────────────────────────────
  handle(CH.schema.listCollections, (connectionId: string) =>
    collections.listCollections(connectionId)
  )
  handle(CH.schema.getCollection, (connectionId: string, name: string) =>
    collections.getCollection(connectionId, name)
  )
  handle(CH.schema.getCollectionSchema, (connectionId: string, name: string) =>
    collections.getCollectionSchema(connectionId, name)
  )
  handle(CH.schema.createCollection, (connectionId: string, definition: unknown) =>
    collections.createCollection(connectionId, definition)
  )
  handle(
    CH.schema.updateCollection,
    (connectionId: string, name: string, patch: Record<string, unknown>, replace?: boolean) =>
      collections.updateCollection(connectionId, name, patch, replace)
  )
  handle(CH.schema.addProperty, (connectionId: string, name: string, property: unknown) =>
    collections.addProperty(connectionId, name, property)
  )
  handle(CH.schema.addReference, (connectionId: string, name: string, reference: unknown) =>
    collections.addReference(connectionId, name, reference)
  )
  handle(CH.schema.addVector, (connectionId: string, name: string, vectors: unknown) =>
    collections.addVector(connectionId, name, vectors)
  )
  handle(
    CH.schema.dropInvertedIndex,
    (connectionId: string, name: string, property: string, index: InvertedIndexName) =>
      collections.dropInvertedIndex(connectionId, name, property, index)
  )
  handle(CH.schema.deleteCollection, (connectionId: string, name: string) =>
    collections.deleteCollection(connectionId, name)
  )
  handle(CH.schema.collectionExists, (connectionId: string, name: string) =>
    collections.collectionExists(connectionId, name)
  )
  handle(CH.schema.exportSchema, (connectionId: string, name?: string) =>
    collections.exportSchema(connectionId, name)
  )
  handle(CH.schema.importSchema, (connectionId: string, definition: unknown) =>
    collections.importSchema(connectionId, definition)
  )
  handle(CH.schema.getShards, (connectionId: string, name: string) =>
    cluster.getShards(connectionId, name)
  )
  handle(
    CH.schema.updateShards,
    (connectionId: string, name: string, status: 'READY' | 'READONLY', shards?: string[]) =>
      cluster.updateShards(connectionId, name, status, shards)
  )
  handle(CH.schema.listTenants, (connectionId: string, name: string) =>
    tenants.listTenants(connectionId, name)
  )

  // ── Tenants ─────────────────────────────────────────────────────────────
  handle(CH.tenants.list, (connectionId: string, collection: string) =>
    tenants.listTenants(connectionId, collection)
  )
  handle(CH.tenants.create, (connectionId: string, collection: string, names: string[]) =>
    tenants.createTenants(connectionId, collection, names)
  )
  handle(CH.tenants.remove, (connectionId: string, collection: string, names: string[]) =>
    tenants.removeTenants(connectionId, collection, names)
  )
  handle(
    CH.tenants.setStatus,
    (
      connectionId: string,
      collection: string,
      names: string[],
      status: TenantActivityStatus
    ) => tenants.setTenantStatus(connectionId, collection, names, status)
  )

  // ── Aliases ─────────────────────────────────────────────────────────────
  handle(CH.alias.list, (connectionId: string, collection?: string) =>
    alias.listAliases(connectionId, collection)
  )
  handle(CH.alias.get, (connectionId: string, name: string) => alias.getAlias(connectionId, name))
  handle(CH.alias.create, (connectionId: string, name: string, collection: string) =>
    alias.createAlias(connectionId, name, collection)
  )
  handle(CH.alias.update, (connectionId: string, name: string, target: string) =>
    alias.updateAlias(connectionId, name, target)
  )
  handle(CH.alias.delete, (connectionId: string, name: string) =>
    alias.deleteAlias(connectionId, name)
  )

  // ── Data ────────────────────────────────────────────────────────────────
  handle(CH.data.fetchObjects, (req: FetchObjectsRequest) => data.fetchObjects(req))
  handle(
    CH.data.getObject,
    (connectionId: string, collection: string, id: string, tenant?: string) =>
      data.getObject(connectionId, collection, id, tenant)
  )
  handle(CH.data.insert, (req: InsertObjectRequest) => data.insertObject(req))
  handle(CH.data.update, (req: UpdateObjectRequest) => data.updateObject(req))
  handle(CH.data.delete, (req: DeleteObjectRequest) => data.deleteObject(req))
  handle(
    CH.data.deleteMany,
    (
      connectionId: string,
      collection: string,
      filters: FilterNode[],
      tenant?: string,
      dryRun?: boolean
    ) => data.deleteMany(connectionId, collection, filters, tenant, dryRun)
  )
  handle(
    CH.data.exists,
    (connectionId: string, collection: string, id: string, tenant?: string) =>
      data.objectExists(connectionId, collection, id, tenant)
  )
  handle(CH.data.importObjects, (req: ImportObjectsRequest) => data.importObjects(req))
  handle(CH.data.exportObjects, (req: ExportObjectsRequest) => data.exportObjects(req))
  handle(CH.data.referenceAdd, (req: ReferenceMutationRequest) => data.referenceAdd(req))
  handle(CH.data.referenceReplace, (req: ReferenceMutationRequest) => data.referenceReplace(req))
  handle(CH.data.referenceDelete, (req: ReferenceMutationRequest) => data.referenceDelete(req))

  // ── Query ───────────────────────────────────────────────────────────────
  handle(CH.query.search, (req: SearchRequest) =>
    cancellable(req.requestId, (signal) => query.search(req, signal))
  )
  handle(CH.query.cancel, (requestId: string) => {
    const controller = inFlight.get(requestId)
    controller?.abort()
    return Boolean(controller)
  })
  handle(CH.query.aggregate, (connectionId: string, collection: string, tenant?: string) =>
    query.aggregate(connectionId, collection, tenant)
  )
  handle(CH.query.collectionStats, (req: CollectionStatsRequest) => query.collectionStats(req))
  handle(CH.query.generate, (req: GenerateRequest) =>
    cancellable(req.search.requestId, (signal) => generate.generate(req, signal))
  )
  handle(CH.query.rawGraphQL, (req: RawGraphQLRequest) =>
    query.rawGraphQL(req.connectionId, req.query)
  )
  handle(CH.query.rawRest, (req: RawRestRequest) =>
    query.rawRest(req.connectionId, req.method, req.path, req.body)
  )

  // ── Backup ──────────────────────────────────────────────────────────────
  handle(CH.backup.create, (req: BackupRequest) => backup.createBackup(req))
  handle(CH.backup.restore, (req: BackupRequest) => backup.restoreBackup(req))
  handle(CH.backup.createStatus, (req: BackupStatusRequest) => backup.createStatus(req))
  handle(CH.backup.restoreStatus, (req: BackupStatusRequest) => backup.restoreStatus(req))
  handle(CH.backup.cancel, (req: BackupCancelRequest) => backup.cancelBackup(req))
  handle(CH.backup.list, (connectionId: string, backend: BackupBackend) =>
    backup.listBackups(connectionId, backend)
  )

  // ── RBAC ────────────────────────────────────────────────────────────────
  handle(CH.rbac.listRoles, (connectionId: string) => rbac.listRoles(connectionId))
  handle(CH.rbac.getRole, (connectionId: string, role: string) => rbac.getRole(connectionId, role))
  handle(CH.rbac.createRole, (connectionId: string, role: string, perms: PermissionInput[]) =>
    rbac.createRole(connectionId, role, perms)
  )
  handle(CH.rbac.deleteRole, (connectionId: string, role: string) =>
    rbac.deleteRole(connectionId, role)
  )
  handle(CH.rbac.addPermissions, (connectionId: string, role: string, perms: PermissionInput[]) =>
    rbac.addPermissions(connectionId, role, perms)
  )
  handle(
    CH.rbac.removePermissions,
    (connectionId: string, role: string, perms: PermissionInput[]) =>
      rbac.removePermissions(connectionId, role, perms)
  )
  handle(CH.rbac.roleAssignments, (connectionId: string, role: string) =>
    rbac.roleAssignments(connectionId, role)
  )
  handle(CH.rbac.listUsers, (connectionId: string) => rbac.listUsers(connectionId))
  handle(CH.rbac.createUser, (connectionId: string, userId: string) =>
    rbac.createUser(connectionId, userId)
  )
  handle(CH.rbac.deleteUser, (connectionId: string, userId: string) =>
    rbac.deleteUser(connectionId, userId)
  )
  handle(CH.rbac.rotateKey, (connectionId: string, userId: string) =>
    rbac.rotateKey(connectionId, userId)
  )
  handle(CH.rbac.setUserActive, (connectionId: string, userId: string, active: boolean) =>
    rbac.setUserActive(connectionId, userId, active)
  )
  handle(CH.rbac.assignRoles, (connectionId: string, userId: string, roles: string[]) =>
    rbac.assignRoles(connectionId, userId, roles)
  )
  handle(CH.rbac.revokeRoles, (connectionId: string, userId: string, roles: string[]) =>
    rbac.revokeRoles(connectionId, userId, roles)
  )
  handle(CH.rbac.getMyUser, (connectionId: string) => rbac.getMyUser(connectionId))
  handle(CH.rbac.getCapabilities, (connectionId: string) =>
    permissions.getCapabilities(connectionId)
  )
  handle(CH.rbac.listGroups, (connectionId: string) => rbac.listGroups(connectionId))
  handle(CH.rbac.groupRoles, (connectionId: string, groupId: string) =>
    rbac.groupRoles(connectionId, groupId)
  )
  handle(CH.rbac.assignGroupRoles, (connectionId: string, groupId: string, roles: string[]) =>
    rbac.assignGroupRoles(connectionId, groupId, roles)
  )
  handle(CH.rbac.revokeGroupRoles, (connectionId: string, groupId: string, roles: string[]) =>
    rbac.revokeGroupRoles(connectionId, groupId, roles)
  )

  // ── Cluster ─────────────────────────────────────────────────────────────
  handle(CH.cluster.nodes, (connectionId: string, collection?: string) =>
    cluster.nodes(connectionId, collection)
  )
  handle(CH.cluster.shardingState, (connectionId: string, collection: string) =>
    cluster.shardingState(connectionId, collection)
  )
  handle(CH.cluster.replicate, (req: ReplicateRequest) => cluster.replicate(req))
  handle(CH.cluster.listReplications, (connectionId: string, collection?: string) =>
    cluster.listReplications(connectionId, collection)
  )
  handle(CH.cluster.cancelReplication, (connectionId: string, id: string) =>
    cluster.cancelReplication(connectionId, id)
  )
  handle(CH.cluster.deleteReplication, (connectionId: string, id: string) =>
    cluster.deleteReplication(connectionId, id)
  )

  // ── Admin ───────────────────────────────────────────────────────────────
  handle(CH.admin.getMeta, (connectionId: string) => admin.getMeta(connectionId))
  handle(CH.admin.getNodes, (connectionId: string) => admin.getNodes(connectionId))
  handle(CH.admin.health, (connectionId: string) => admin.health(connectionId))
  handle(CH.admin.tokenize, (req: TokenizeRequest) => admin.tokenize(req))

  // ── History / saved queries ─────────────────────────────────────────────
  handle(CH.history.list, (connectionId: string, collection?: string) =>
    loadHistory(connectionId, collection)
  )
  handle(CH.history.record, (entry: Omit<HistoryEntry, 'id' | 'at'>) => recordHistory(entry))
  handle(CH.history.clear, (connectionId?: string) => clearHistory(connectionId))
  handle(CH.history.listSaved, () => loadSavedQueries())
  handle(CH.history.save, (q: Omit<SavedQuery, 'id' | 'savedAt'>) => saveQuery(q))
  handle(CH.history.deleteSaved, (id: string) => deleteSavedQuery(id))
}
