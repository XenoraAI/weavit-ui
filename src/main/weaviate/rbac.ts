import weaviate from 'weaviate-client'
import { getClient } from './connectionManager'
import { errorMessage, normalizeForIpc } from '../util'
import type {
  PermissionInput,
  RoleAssignments,
  RoleInfo,
  RolePermission,
  UserInfo
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// The permission builders are only reachable through the client's default
// export, never as a named one. Depending on how the bundler resolves the
// import, `weaviate` here is either that default object or the whole module
// namespace, so look in both places rather than betting on one.
const clientModule = weaviate as any
const perms = clientModule.permissions ?? clientModule.default?.permissions

function permissionBuilders(): any {
  if (!perms) {
    throw new Error(
      'This build of weaviate-client does not expose the RBAC permission builders'
    )
  }
  return perms
}

// Role-based access control. Weaviate models permissions as one array per
// resource kind on the Role object; the UI works with a single flat list, so
// this module flattens on read and re-groups on write.

/** Role field -> the resource name the UI uses. */
const ROLE_PERMISSION_FIELDS: { field: string; resource: string }[] = [
  { field: 'aliasPermissions', resource: 'aliases' },
  { field: 'backupsPermissions', resource: 'backups' },
  { field: 'clusterPermissions', resource: 'cluster' },
  { field: 'collectionsPermissions', resource: 'collections' },
  { field: 'dataPermissions', resource: 'data' },
  { field: 'groupsPermissions', resource: 'groups' },
  { field: 'mcpPermissions', resource: 'mcp' },
  { field: 'nodesPermissions', resource: 'nodes' },
  { field: 'replicatePermissions', resource: 'replicate' },
  { field: 'rolesPermissions', resource: 'roles' },
  { field: 'tenantsPermissions', resource: 'tenants' },
  { field: 'usersPermissions', resource: 'users' }
]

/** Server actions are `verb_resource` (e.g. read_data); the UI shows the verb. */
export function verbOf(action: string): string {
  const idx = action.indexOf('_')
  return idx === -1 ? action : action.slice(0, idx)
}

/**
 * Permission fields the server sent that `flattenRole` drops on the floor —
 * a resource kind added to Weaviate after this build. Callers reasoning about
 * what a user may do need to know their picture of a role is incomplete;
 * callers merely displaying one do not.
 */
export function unmodeledPermissionFields(raw: any): string[] {
  const modeled = new Set(ROLE_PERMISSION_FIELDS.map((f) => f.field))
  return Object.keys(raw ?? {}).filter(
    (k) => k.endsWith('Permissions') && !modeled.has(k) && (raw[k]?.length ?? 0) > 0
  )
}

export function flattenRole(raw: any): RoleInfo {
  const out: RolePermission[] = []
  for (const { field, resource } of ROLE_PERMISSION_FIELDS) {
    for (const p of raw?.[field] ?? []) {
      out.push({
        resource,
        actions: (p?.actions ?? []).map((a: string) => verbOf(a)),
        collection: p?.collection,
        tenant: p?.tenant,
        alias: p?.alias,
        role: p?.role,
        user: p?.users,
        group: p?.groupID,
        raw: normalizeForIpc(p)
      })
    }
  }
  return { name: raw?.name, permissions: out }
}

/** Turn a UI permission row back into the SDK's builder output. */
export function toSdkPermission(input: PermissionInput): any {
  const build = permissionBuilders()
  const a = input.actions ?? {}
  const collection = input.collection || '*'
  switch (input.resource) {
    case 'aliases':
      return build.aliases({
        alias: input.alias || '*',
        collection,
        create: a.create,
        read: a.read,
        update: a.update,
        delete: a.delete
      })
    case 'backups':
      return build.backup({ collection, manage: a.manage })
    case 'cluster':
      return build.cluster({ read: a.read })
    case 'collections':
      return build.collections({
        collection,
        create_collection: a.create,
        read_config: a.read,
        update_config: a.update,
        delete_collection: a.delete
      })
    case 'data':
      return build.data({
        collection,
        tenant: input.tenant || '*',
        create: a.create,
        read: a.read,
        update: a.update,
        delete: a.delete
      })
    case 'groups':
      return build.groups.oidc({
        groupID: input.group || '*',
        read: a.read,
        assignAndRevoke: a.assign
      })
    case 'mcp':
      return build.mcp({ create: a.create, read: a.read, update: a.update })
    case 'nodes':
      return input.verbosity === 'minimal'
        ? build.nodes.minimal({ read: a.read })
        : build.nodes.verbose({ collection, read: a.read })
    case 'replicate':
      return build.replicate({
        collection,
        shard: '*',
        create: a.create,
        read: a.read,
        update: a.update,
        delete: a.delete
      })
    case 'roles':
      return build.roles({
        role: input.role || '*',
        create: a.create,
        read: a.read,
        update: a.update,
        delete: a.delete
      })
    case 'tenants':
      return build.tenants({
        collection,
        tenant: input.tenant || '*',
        create: a.create,
        read: a.read,
        update: a.update,
        delete: a.delete
      })
    case 'users':
      return build.users({
        user: input.user || '*',
        read: a.read,
        assignAndRevoke: a.assign
      })
    default:
      throw new Error(`Unknown permission resource: ${input.resource}`)
  }
}

function toSdkPermissions(inputs: PermissionInput[]): any[] {
  return inputs.map(toSdkPermission)
}

/**
 * Weaviate protects its built-in `root` and `read-only` roles, refusing to
 * assign, revoke or modify them with a 403 whose body is a nested JSON blob.
 * Turn that into a sentence, since the raw error reads like a permissions
 * problem with the caller when it is really a property of the role.
 */
export function protectedRoleMessage(e: unknown): string | undefined {
  const match = /modifying '([^']+)' role or changing its assignments is not allowed/i.exec(
    errorMessage(e)
  )
  if (!match) return undefined
  const role = match[1]
  const alias =
    role === 'read-only'
      ? ' It is a legacy alias of "viewer" — assign "viewer" instead.'
      : ''
  return `Weaviate protects the built-in "${role}" role: it cannot be assigned, revoked or modified.${alias}`
}

/** Runs an RBAC call, replacing a protected-role refusal with a clear message. */
async function withRoleGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const message = protectedRoleMessage(e)
    if (!message) throw e
    throw new Error(message)
  }
}

// ── Roles ───────────────────────────────────────────────────────────────────

export async function listRoles(connectionId: string): Promise<RoleInfo[]> {
  const client = await getClient(connectionId)
  const all = await client.roles.listAll()
  return Object.values(all ?? {})
    .map(flattenRole)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getRole(connectionId: string, role: string): Promise<RoleInfo | null> {
  const client = await getClient(connectionId)
  const raw = await client.roles.byName(role)
  return raw ? flattenRole(raw) : null
}

export async function createRole(
  connectionId: string,
  role: string,
  inputs: PermissionInput[]
): Promise<void> {
  if (!role.trim()) throw new Error('Role name is required')
  const client = await getClient(connectionId)
  await withRoleGuard(() => client.roles.create(role, toSdkPermissions(inputs)))
}

export async function deleteRole(connectionId: string, role: string): Promise<void> {
  const client = await getClient(connectionId)
  await withRoleGuard(() => client.roles.delete(role))
}

export async function addPermissions(
  connectionId: string,
  role: string,
  inputs: PermissionInput[]
): Promise<void> {
  if (inputs.length === 0) throw new Error('Select at least one permission')
  const client = await getClient(connectionId)
  await withRoleGuard(() => client.roles.addPermissions(role, toSdkPermissions(inputs)))
}

export async function removePermissions(
  connectionId: string,
  role: string,
  inputs: PermissionInput[]
): Promise<void> {
  if (inputs.length === 0) throw new Error('Select at least one permission')
  const client = await getClient(connectionId)
  await withRoleGuard(() => client.roles.removePermissions(role, toSdkPermissions(inputs)))
}

export async function roleAssignments(
  connectionId: string,
  role: string
): Promise<RoleAssignments> {
  const client = await getClient(connectionId)
  const [users, groups] = await Promise.all([
    client.roles.userAssignments(role).catch(() => []),
    client.roles.getGroupAssignments(role).catch(() => [])
  ])
  return {
    users: (users ?? []).map((u: any) => ({ userId: u.id, userType: u.userType })),
    groups: (groups ?? []).map((g: any) => ({ groupId: g.groupID, groupType: g.groupType }))
  }
}

// ── Users ───────────────────────────────────────────────────────────────────

function toUserInfo(raw: any): UserInfo {
  return normalizeForIpc<UserInfo>({
    id: raw?.id,
    kind: raw?.userType,
    active: raw?.active,
    roles: raw?.roleNames ?? (raw?.roles ?? []).map((r: any) => r?.name).filter(Boolean),
    createdAt: raw?.createdAt,
    lastUsedAt: raw?.lastUsedAt
  })
}

export async function listUsers(connectionId: string): Promise<UserInfo[]> {
  const client = await getClient(connectionId)
  const all = await client.users.db.listAll({ includeLastUsedTime: true })
  return (all ?? []).map(toUserInfo).sort((a, b) => a.id.localeCompare(b.id))
}

export async function createUser(
  connectionId: string,
  userId: string
): Promise<{ apiKey: string }> {
  if (!userId.trim()) throw new Error('User ID is required')
  const client = await getClient(connectionId)
  return { apiKey: await client.users.db.create(userId) }
}

export async function deleteUser(connectionId: string, userId: string): Promise<boolean> {
  const client = await getClient(connectionId)
  return client.users.db.delete(userId)
}

/** Issues a fresh API key and invalidates the old one immediately. */
export async function rotateKey(
  connectionId: string,
  userId: string
): Promise<{ apiKey: string }> {
  const client = await getClient(connectionId)
  return { apiKey: await client.users.db.rotateKey(userId) }
}

export async function setUserActive(
  connectionId: string,
  userId: string,
  active: boolean
): Promise<boolean> {
  const client = await getClient(connectionId)
  return active ? client.users.db.activate(userId) : client.users.db.deactivate(userId)
}

export async function assignRoles(
  connectionId: string,
  userId: string,
  roles: string[]
): Promise<void> {
  if (roles.length === 0) throw new Error('Select at least one role')
  const client = await getClient(connectionId)
  await withRoleGuard(() => client.users.db.assignRoles(roles, userId))
}

export async function revokeRoles(
  connectionId: string,
  userId: string,
  roles: string[]
): Promise<void> {
  if (roles.length === 0) throw new Error('Select at least one role')
  const client = await getClient(connectionId)
  await withRoleGuard(() => client.users.db.revokeRoles(roles, userId))
}

export async function getMyUser(connectionId: string): Promise<UserInfo> {
  const client = await getClient(connectionId)
  return toUserInfo(await client.users.getMyUser())
}

// ── OIDC groups ─────────────────────────────────────────────────────────────

export async function listGroups(connectionId: string): Promise<string[]> {
  const client = await getClient(connectionId)
  try {
    return await client.groups.oidc.getKnownGroupNames()
  } catch {
    // OIDC dynamic auth isn't configured on this instance.
    return []
  }
}

export async function groupRoles(connectionId: string, groupId: string): Promise<string[]> {
  const client = await getClient(connectionId)
  const roles = await client.groups.oidc.getAssignedRoles(groupId)
  return Object.keys(roles ?? {}).sort()
}

export async function assignGroupRoles(
  connectionId: string,
  groupId: string,
  roles: string[]
): Promise<void> {
  if (roles.length === 0) throw new Error('Select at least one role')
  const client = await getClient(connectionId)
  await withRoleGuard(() => client.groups.oidc.assignRoles(groupId, roles))
}

export async function revokeGroupRoles(
  connectionId: string,
  groupId: string,
  roles: string[]
): Promise<void> {
  if (roles.length === 0) throw new Error('Select at least one role')
  const client = await getClient(connectionId)
  await withRoleGuard(() => client.groups.oidc.revokeRoles(groupId, roles))
}
