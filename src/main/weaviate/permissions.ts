import { getClient } from './connectionManager'
import { flattenRole, unmodeledPermissionFields } from './rbac'
import { errorMessage } from '../util'
import type { Capabilities, RolePermission } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Works out what the connected user may do, by flattening every permission
// carried by every role they hold.
//
// `getMyUser` usually answers the whole question by itself: it returns the
// roles with their permissions inlined. Where it returns only names — server
// versions differ — each role is fetched instead, which needs `read_roles`
// and so can fail for the very user we are asking about.
//
// The result is deliberately all-or-nothing. A snapshot missing one role's
// permissions would read as "denied" for everything that role granted, so
// anything short of a complete picture is marked unresolved, and the matcher
// in `@shared/permissions` then allows everything.

function unresolved(note: string, roles: string[] = [], userId?: string): Capabilities {
  return { resolved: false, userId, roles, permissions: [], note }
}

/** The snapshot needs the shape of a grant, not the payload behind it. */
function withoutRaw(p: RolePermission): RolePermission {
  const { raw: _raw, ...rest } = p
  return rest
}

/** `roles` arrives as an array of role objects on some versions and as a
 *  name-keyed record on others; `roleNames` is a third spelling. */
function rawRoles(me: any): any[] {
  if (Array.isArray(me?.roles)) return me.roles
  if (me?.roles && typeof me.roles === 'object') return Object.values(me.roles)
  return []
}

function roleNamesOf(me: any): string[] {
  if (Array.isArray(me?.roleNames)) return me.roleNames
  return rawRoles(me)
    .map((r: any) => (typeof r === 'string' ? r : r?.name))
    .filter(Boolean)
}

/** A role object only helps if it actually carries its permissions. */
function carriesPermissions(raw: any): boolean {
  return Object.keys(raw ?? {}).some((k) => k.endsWith('Permissions'))
}

function inlineRole(me: any, name: string): any | undefined {
  const found = rawRoles(me).find((r: any) => r?.name === name)
  return carriesPermissions(found) ? found : undefined
}

/**
 * Builds the snapshot from a raw `getMyUser` payload, falling back to
 * `fetchRole` for any role that arrived as a bare name.
 */
export async function buildCapabilities(
  me: any,
  fetchRole: (name: string) => Promise<any>
): Promise<Capabilities> {
  const userId: string | undefined = me?.id
  const roles = roleNamesOf(me)
  if (roles.length === 0) {
    return unresolved('Weaviate reported no roles for the current user.', [], userId)
  }

  const permissions: RolePermission[] = []
  for (const name of roles) {
    let raw = inlineRole(me, name)
    if (!raw) {
      try {
        raw = await fetchRole(name)
      } catch (e) {
        // Reading roles is itself a permission; a user can hold a role they
        // are not allowed to look at.
        return unresolved(`Role "${name}" could not be read: ${errorMessage(e)}`, roles, userId)
      }
    }
    if (!raw) return unresolved(`Role "${name}" could not be read.`, roles, userId)

    const unmodeled = unmodeledPermissionFields(raw)
    if (unmodeled.length > 0) {
      return unresolved(
        `Role "${name}" grants permissions this version of the app does not model ` +
          `(${unmodeled.join(', ')}).`,
        roles,
        userId
      )
    }

    const flat = flattenRole(raw)
    if (flat.permissions.length === 0) {
      // A role that grants nothing is indistinguishable from one whose grants
      // the server keeps to itself, and the second is the dangerous reading.
      return unresolved(`Role "${name}" listed no permissions.`, roles, userId)
    }
    permissions.push(...flat.permissions.map(withoutRaw))
  }

  return { resolved: true, userId, roles, permissions }
}

export async function getCapabilities(connectionId: string): Promise<Capabilities> {
  const client = await getClient(connectionId)
  let me: any
  try {
    me = await client.users.getMyUser()
  } catch (e) {
    // Anonymous instances and instances without RBAC both land here.
    return unresolved(`Weaviate did not report a current user: ${errorMessage(e)}`)
  }
  return buildCapabilities(me, (name) => client.roles.byName(name))
}
