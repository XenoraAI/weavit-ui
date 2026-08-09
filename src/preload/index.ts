import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '@shared/channels'
import type {
  ConnectionConfig,
  DeleteObjectRequest,
  FetchObjectsRequest,
  FilterCondition,
  InsertObjectRequest,
  RawGraphQLRequest,
  RawRestRequest,
  SearchRequest,
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
    deleteCollection: (connectionId: string, name: string) =>
      invoke(CH.schema.deleteCollection, connectionId, name),
    listTenants: (connectionId: string, collection: string) =>
      invoke(CH.schema.listTenants, connectionId, collection)
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
      filters: FilterCondition[],
      tenant?: string
    ) => invoke(CH.data.deleteMany, connectionId, collection, filters, tenant)
  },
  query: {
    search: (req: SearchRequest) => invoke(CH.query.search, req),
    aggregate: (connectionId: string, collection: string, tenant?: string) =>
      invoke(CH.query.aggregate, connectionId, collection, tenant),
    rawGraphQL: (req: RawGraphQLRequest) => invoke(CH.query.rawGraphQL, req),
    rawRest: (req: RawRestRequest) => invoke(CH.query.rawRest, req)
  },
  admin: {
    getMeta: (connectionId: string) => invoke(CH.admin.getMeta, connectionId),
    getNodes: (connectionId: string) => invoke(CH.admin.getNodes, connectionId)
  }
}

contextBridge.exposeInMainWorld('api', api)
