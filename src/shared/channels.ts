// Canonical IPC channel names, shared by preload and main so they never drift.
export const CH = {
  connections: {
    list: 'connections:list',
    upsert: 'connections:upsert',
    remove: 'connections:remove',
    test: 'connections:test',
    connect: 'connections:connect',
    disconnect: 'connections:disconnect'
  },
  schema: {
    listCollections: 'schema:listCollections',
    getCollection: 'schema:getCollection',
    createCollection: 'schema:createCollection',
    deleteCollection: 'schema:deleteCollection',
    listTenants: 'schema:listTenants'
  },
  data: {
    fetchObjects: 'data:fetchObjects',
    getObject: 'data:getObject',
    insert: 'data:insert',
    update: 'data:update',
    delete: 'data:delete',
    deleteMany: 'data:deleteMany'
  },
  query: {
    search: 'query:search',
    aggregate: 'query:aggregate',
    rawGraphQL: 'query:rawGraphQL',
    rawRest: 'query:rawRest'
  },
  admin: {
    getMeta: 'admin:getMeta',
    getNodes: 'admin:getNodes'
  }
} as const
