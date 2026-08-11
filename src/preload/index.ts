import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '@shared/channels'
import type {
  BackupBackend,
  BackupCancelRequest,
  BackupRequest,
  BackupStatusRequest,
  CollectionStatsRequest,
  ConnectionConfig,
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
  TokenizeRequest,
  UpdateObjectRequest,
  WeftApi
} from '@shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args)

// The single, typed surface exposed to the renderer. The renderer can only
// reach Weaviate through these methods — never directly.
const api: WeftApi = {
  connections: {
    list: () => invoke(CH.connections.list),
    upsert: (config: ConnectionConfig, apiKey?: string | null) =>
      invoke(CH.connections.upsert, config, apiKey),
    remove: (id: string) => invoke(CH.connections.remove, id),
    test: (id: string) => invoke(CH.connections.test, id),
    connect: (id: string) => invoke(CH.connections.connect, id),
    disconnect: (id: string) => invoke(CH.connections.disconnect, id)
  },
  schema: {
    listCollections: (connectionId: string) => invoke(CH.schema.listCollections, connectionId),
    getCollection: (connectionId: string, name: string) =>
      invoke(CH.schema.getCollection, connectionId, name),
    getCollectionSchema: (connectionId: string, name: string) =>
      invoke(CH.schema.getCollectionSchema, connectionId, name),
    createCollection: (connectionId: string, definition: unknown) =>
      invoke(CH.schema.createCollection, connectionId, definition),
    updateCollection: (
      connectionId: string,
      name: string,
      patch: Record<string, unknown>,
      replace?: boolean
    ) => invoke(CH.schema.updateCollection, connectionId, name, patch, replace),
    addProperty: (connectionId: string, name: string, property: unknown) =>
      invoke(CH.schema.addProperty, connectionId, name, property),
    addReference: (connectionId: string, name: string, reference: unknown) =>
      invoke(CH.schema.addReference, connectionId, name, reference),
    addVector: (connectionId: string, name: string, vectors: unknown) =>
      invoke(CH.schema.addVector, connectionId, name, vectors),
    dropInvertedIndex: (
      connectionId: string,
      name: string,
      property: string,
      index: InvertedIndexName
    ) => invoke(CH.schema.dropInvertedIndex, connectionId, name, property, index),
    deleteCollection: (connectionId: string, name: string) =>
      invoke(CH.schema.deleteCollection, connectionId, name),
    collectionExists: (connectionId: string, name: string) =>
      invoke(CH.schema.collectionExists, connectionId, name),
    exportSchema: (connectionId: string, name?: string) =>
      invoke(CH.schema.exportSchema, connectionId, name),
    importSchema: (connectionId: string, definition: unknown) =>
      invoke(CH.schema.importSchema, connectionId, definition),
    getShards: (connectionId: string, name: string) =>
      invoke(CH.schema.getShards, connectionId, name),
    updateShards: (
      connectionId: string,
      name: string,
      status: 'READY' | 'READONLY',
      shards?: string[]
    ) => invoke(CH.schema.updateShards, connectionId, name, status, shards),
    listTenants: (connectionId: string, collection: string) =>
      invoke(CH.schema.listTenants, connectionId, collection)
  },
  tenants: {
    list: (connectionId: string, collection: string) =>
      invoke(CH.tenants.list, connectionId, collection),
    create: (connectionId: string, collection: string, names: string[]) =>
      invoke(CH.tenants.create, connectionId, collection, names),
    remove: (connectionId: string, collection: string, names: string[]) =>
      invoke(CH.tenants.remove, connectionId, collection, names),
    setStatus: (
      connectionId: string,
      collection: string,
      names: string[],
      status: TenantActivityStatus
    ) => invoke(CH.tenants.setStatus, connectionId, collection, names, status)
  },
  alias: {
    list: (connectionId: string, collection?: string) =>
      invoke(CH.alias.list, connectionId, collection),
    get: (connectionId: string, name: string) => invoke(CH.alias.get, connectionId, name),
    create: (connectionId: string, name: string, collection: string) =>
      invoke(CH.alias.create, connectionId, name, collection),
    update: (connectionId: string, name: string, target: string) =>
      invoke(CH.alias.update, connectionId, name, target),
    delete: (connectionId: string, name: string) => invoke(CH.alias.delete, connectionId, name)
  },
  data: {
    fetchObjects: (req: FetchObjectsRequest) => invoke(CH.data.fetchObjects, req),
    getObject: (connectionId: string, collection: string, id: string, tenant?: string) =>
      invoke(CH.data.getObject, connectionId, collection, id, tenant),
    insert: (req: InsertObjectRequest) => invoke(CH.data.insert, req),
    update: (req: UpdateObjectRequest) => invoke(CH.data.update, req),
    delete: (req: DeleteObjectRequest) => invoke(CH.data.delete, req),
    deleteMany: (
      connectionId: string,
      collection: string,
      filters: FilterNode[],
      tenant?: string,
      dryRun?: boolean
    ) => invoke(CH.data.deleteMany, connectionId, collection, filters, tenant, dryRun),
    exists: (connectionId: string, collection: string, id: string, tenant?: string) =>
      invoke(CH.data.exists, connectionId, collection, id, tenant),
    importObjects: (req: ImportObjectsRequest) => invoke(CH.data.importObjects, req),
    exportObjects: (req: ExportObjectsRequest) => invoke(CH.data.exportObjects, req),
    referenceAdd: (req: ReferenceMutationRequest) => invoke(CH.data.referenceAdd, req),
    referenceReplace: (req: ReferenceMutationRequest) => invoke(CH.data.referenceReplace, req),
    referenceDelete: (req: ReferenceMutationRequest) => invoke(CH.data.referenceDelete, req)
  },
  query: {
    search: (req: SearchRequest) => invoke(CH.query.search, req),
    cancel: (requestId: string) => invoke(CH.query.cancel, requestId),
    aggregate: (connectionId: string, collection: string, tenant?: string) =>
      invoke(CH.query.aggregate, connectionId, collection, tenant),
    collectionStats: (req: CollectionStatsRequest) => invoke(CH.query.collectionStats, req),
    generate: (req: GenerateRequest) => invoke(CH.query.generate, req),
    rawGraphQL: (req: RawGraphQLRequest) => invoke(CH.query.rawGraphQL, req),
    rawRest: (req: RawRestRequest) => invoke(CH.query.rawRest, req)
  },
  backup: {
    create: (req: BackupRequest) => invoke(CH.backup.create, req),
    restore: (req: BackupRequest) => invoke(CH.backup.restore, req),
    createStatus: (req: BackupStatusRequest) => invoke(CH.backup.createStatus, req),
    restoreStatus: (req: BackupStatusRequest) => invoke(CH.backup.restoreStatus, req),
    cancel: (req: BackupCancelRequest) => invoke(CH.backup.cancel, req),
    list: (connectionId: string, backend: BackupBackend) =>
      invoke(CH.backup.list, connectionId, backend)
  },
  rbac: {
    listRoles: (connectionId: string) => invoke(CH.rbac.listRoles, connectionId),
    getRole: (connectionId: string, role: string) => invoke(CH.rbac.getRole, connectionId, role),
    createRole: (connectionId: string, role: string, permissions: PermissionInput[]) =>
      invoke(CH.rbac.createRole, connectionId, role, permissions),
    deleteRole: (connectionId: string, role: string) =>
      invoke(CH.rbac.deleteRole, connectionId, role),
    addPermissions: (connectionId: string, role: string, permissions: PermissionInput[]) =>
      invoke(CH.rbac.addPermissions, connectionId, role, permissions),
    removePermissions: (connectionId: string, role: string, permissions: PermissionInput[]) =>
      invoke(CH.rbac.removePermissions, connectionId, role, permissions),
    roleAssignments: (connectionId: string, role: string) =>
      invoke(CH.rbac.roleAssignments, connectionId, role),
    listUsers: (connectionId: string) => invoke(CH.rbac.listUsers, connectionId),
    createUser: (connectionId: string, userId: string) =>
      invoke(CH.rbac.createUser, connectionId, userId),
    deleteUser: (connectionId: string, userId: string) =>
      invoke(CH.rbac.deleteUser, connectionId, userId),
    rotateKey: (connectionId: string, userId: string) =>
      invoke(CH.rbac.rotateKey, connectionId, userId),
    setUserActive: (connectionId: string, userId: string, active: boolean) =>
      invoke(CH.rbac.setUserActive, connectionId, userId, active),
    assignRoles: (connectionId: string, userId: string, roles: string[]) =>
      invoke(CH.rbac.assignRoles, connectionId, userId, roles),
    revokeRoles: (connectionId: string, userId: string, roles: string[]) =>
      invoke(CH.rbac.revokeRoles, connectionId, userId, roles),
    getMyUser: (connectionId: string) => invoke(CH.rbac.getMyUser, connectionId),
    getCapabilities: (connectionId: string) => invoke(CH.rbac.getCapabilities, connectionId),
    listGroups: (connectionId: string) => invoke(CH.rbac.listGroups, connectionId),
    groupRoles: (connectionId: string, groupId: string) =>
      invoke(CH.rbac.groupRoles, connectionId, groupId),
    assignGroupRoles: (connectionId: string, groupId: string, roles: string[]) =>
      invoke(CH.rbac.assignGroupRoles, connectionId, groupId, roles),
    revokeGroupRoles: (connectionId: string, groupId: string, roles: string[]) =>
      invoke(CH.rbac.revokeGroupRoles, connectionId, groupId, roles)
  },
  cluster: {
    nodes: (connectionId: string, collection?: string) =>
      invoke(CH.cluster.nodes, connectionId, collection),
    shardingState: (connectionId: string, collection: string) =>
      invoke(CH.cluster.shardingState, connectionId, collection),
    replicate: (req: ReplicateRequest) => invoke(CH.cluster.replicate, req),
    listReplications: (connectionId: string, collection?: string) =>
      invoke(CH.cluster.listReplications, connectionId, collection),
    cancelReplication: (connectionId: string, id: string) =>
      invoke(CH.cluster.cancelReplication, connectionId, id),
    deleteReplication: (connectionId: string, id: string) =>
      invoke(CH.cluster.deleteReplication, connectionId, id)
  },
  admin: {
    getMeta: (connectionId: string) => invoke(CH.admin.getMeta, connectionId),
    getNodes: (connectionId: string) => invoke(CH.admin.getNodes, connectionId),
    health: (connectionId: string) => invoke(CH.admin.health, connectionId),
    tokenize: (req: TokenizeRequest) => invoke(CH.admin.tokenize, req)
  },
  history: {
    list: (connectionId: string, collection?: string) =>
      invoke(CH.history.list, connectionId, collection),
    record: (entry: Omit<HistoryEntry, 'id' | 'at'>) => invoke(CH.history.record, entry),
    clear: (connectionId?: string) => invoke(CH.history.clear, connectionId),
    listSaved: () => invoke(CH.history.listSaved),
    save: (q: Omit<SavedQuery, 'id' | 'savedAt'>) => invoke(CH.history.save, q),
    deleteSaved: (id: string) => invoke(CH.history.deleteSaved, id)
  }
}

contextBridge.exposeInMainWorld('api', api)
