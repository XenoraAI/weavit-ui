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
    getCollectionSchema: 'schema:getCollectionSchema',
    createCollection: 'schema:createCollection',
    updateCollection: 'schema:updateCollection',
    addProperty: 'schema:addProperty',
    addReference: 'schema:addReference',
    addVector: 'schema:addVector',
    dropInvertedIndex: 'schema:dropInvertedIndex',
    deleteCollection: 'schema:deleteCollection',
    collectionExists: 'schema:collectionExists',
    exportSchema: 'schema:exportSchema',
    importSchema: 'schema:importSchema',
    getShards: 'schema:getShards',
    updateShards: 'schema:updateShards',
    listTenants: 'schema:listTenants'
  },
  tenants: {
    list: 'tenants:list',
    create: 'tenants:create',
    remove: 'tenants:remove',
    setStatus: 'tenants:setStatus'
  },
  alias: {
    list: 'alias:list',
    get: 'alias:get',
    create: 'alias:create',
    update: 'alias:update',
    delete: 'alias:delete'
  },
  data: {
    fetchObjects: 'data:fetchObjects',
    getObject: 'data:getObject',
    insert: 'data:insert',
    update: 'data:update',
    delete: 'data:delete',
    deleteMany: 'data:deleteMany',
    exists: 'data:exists',
    importObjects: 'data:importObjects',
    exportObjects: 'data:exportObjects',
    referenceAdd: 'data:referenceAdd',
    referenceReplace: 'data:referenceReplace',
    referenceDelete: 'data:referenceDelete'
  },
  query: {
    search: 'query:search',
    cancel: 'query:cancel',
    aggregate: 'query:aggregate',
    collectionStats: 'query:collectionStats',
    generate: 'query:generate',
    rawGraphQL: 'query:rawGraphQL',
    rawRest: 'query:rawRest'
  },
  backup: {
    create: 'backup:create',
    restore: 'backup:restore',
    createStatus: 'backup:createStatus',
    restoreStatus: 'backup:restoreStatus',
    cancel: 'backup:cancel',
    list: 'backup:list'
  },
  rbac: {
    listRoles: 'rbac:listRoles',
    getRole: 'rbac:getRole',
    createRole: 'rbac:createRole',
    deleteRole: 'rbac:deleteRole',
    addPermissions: 'rbac:addPermissions',
    removePermissions: 'rbac:removePermissions',
    roleAssignments: 'rbac:roleAssignments',
    listUsers: 'rbac:listUsers',
    createUser: 'rbac:createUser',
    deleteUser: 'rbac:deleteUser',
    rotateKey: 'rbac:rotateKey',
    setUserActive: 'rbac:setUserActive',
    assignRoles: 'rbac:assignRoles',
    revokeRoles: 'rbac:revokeRoles',
    getMyUser: 'rbac:getMyUser',
    getCapabilities: 'rbac:getCapabilities',
    listGroups: 'rbac:listGroups',
    groupRoles: 'rbac:groupRoles',
    assignGroupRoles: 'rbac:assignGroupRoles',
    revokeGroupRoles: 'rbac:revokeGroupRoles'
  },
  cluster: {
    nodes: 'cluster:nodes',
    shardingState: 'cluster:shardingState',
    replicate: 'cluster:replicate',
    listReplications: 'cluster:listReplications',
    cancelReplication: 'cluster:cancelReplication',
    deleteReplication: 'cluster:deleteReplication'
  },
  admin: {
    getMeta: 'admin:getMeta',
    getNodes: 'admin:getNodes',
    health: 'admin:health',
    tokenize: 'admin:tokenize'
  },
  history: {
    list: 'history:list',
    record: 'history:record',
    clear: 'history:clear',
    listSaved: 'history:listSaved',
    save: 'history:save',
    deleteSaved: 'history:deleteSaved'
  }
} as const
