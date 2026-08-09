import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { CH } from '@shared/channels'
import type {
  ConnectionConfig,
  ConnectionWithSecretFlag,
  ConnectResult,
  DeleteObjectRequest,
  FetchObjectsRequest,
  FilterCondition,
  InsertObjectRequest,
  RawGraphQLRequest,
  RawRestRequest,
  SearchRequest,
  TestResult,
  UpdateObjectRequest
} from '@shared/types'
import { loadConnections, saveConnections, setSecret, hasSecret, deleteSecret } from '../store/store'
import { evictClient, getClient, getConnectionConfig } from '../weaviate/connectionManager'
import * as collections from '../weaviate/collections'
import * as data from '../weaviate/data'
import * as query from '../weaviate/query'
import * as admin from '../weaviate/admin'
import { errorMessage } from '../util'

function withFlags(list: ConnectionConfig[]): ConnectionWithSecretFlag[] {
  return list.map((c) => ({ ...c, hasApiKey: hasSecret(c.id) }))
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
  handle(CH.schema.deleteCollection, (connectionId: string, name: string) =>
    collections.deleteCollection(connectionId, name)
  )
  handle(CH.schema.listTenants, (connectionId: string, name: string) =>
    collections.listTenants(connectionId, name)
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
    (connectionId: string, collection: string, filters: FilterCondition[], tenant?: string) =>
      data.deleteMany(connectionId, collection, filters, tenant)
  )

  // ── Query ───────────────────────────────────────────────────────────────
  handle(CH.query.search, (req: SearchRequest) => query.search(req))
  handle(CH.query.aggregate, (connectionId: string, collection: string, tenant?: string) =>
    query.aggregate(connectionId, collection, tenant)
  )
  handle(CH.query.rawGraphQL, (req: RawGraphQLRequest) =>
    query.rawGraphQL(req.connectionId, req.query)
  )
  handle(CH.query.rawRest, (req: RawRestRequest) =>
    query.rawRest(req.connectionId, req.method, req.path, req.body)
  )

  // ── Admin ───────────────────────────────────────────────────────────────
  handle(CH.admin.getMeta, (connectionId: string) => admin.getMeta(connectionId))
  handle(CH.admin.getNodes, (connectionId: string) => admin.getNodes(connectionId))
}
