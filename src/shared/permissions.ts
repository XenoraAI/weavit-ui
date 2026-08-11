import type { Capabilities, RolePermission } from './types'

// Answers "may this user do X?" against a Capabilities snapshot, so the UI can
// explain a refusal before the server has to issue one.
//
// Every rule here leans towards yes. A snapshot that could not be resolved, an
// action this module doesn't recognise, a scope the server described in a way
// we don't understand — all of it allows. The only way to get a no is for the
// snapshot to be resolved and for no permission in it to match, which is the
// one case we can state with confidence.

/** The resource kinds Weaviate groups permissions under. */
export type PermissionResource =
  | 'aliases'
  | 'backups'
  | 'cluster'
  | 'collections'
  | 'data'
  | 'groups'
  | 'mcp'
  | 'nodes'
  | 'replicate'
  | 'roles'
  | 'tenants'
  | 'users'

/** The verbs, as `flattenRole` reduces the server's `verb_resource` actions. */
export type PermissionVerb = 'create' | 'read' | 'update' | 'delete' | 'manage' | 'assign'

/** e.g. `'data.update'`, `'collections.create'`, `'users.assign'`. */
export type CapabilityAction = `${PermissionResource}.${PermissionVerb}`

/** Everything that isn't `read`: holding none of these is what read-only means. */
export const WRITE_VERBS: readonly string[] = ['create', 'update', 'delete', 'manage', 'assign']

/** The named thing an action applies to, where the resource has one. */
export interface PermissionScope {
  collection?: string
  tenant?: string
  alias?: string
  role?: string
  user?: string
  group?: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Weaviate scopes a permission by name, where `*` stands in for any run of
 *  characters. Matching is case-insensitive: collection names differ only by
 *  the leading capital Weaviate applies itself, and the permissive reading is
 *  the right one when they disagree. */
function nameMatches(pattern: string, value: string): boolean {
  if (!pattern.includes('*')) return pattern.toLowerCase() === value.toLowerCase()
  const body = pattern.split('*').map(escapeRegExp).join('.*')
  return new RegExp(`^${body}$`, 'i').test(value)
}

/**
 * A granted scope against the one being asked about. An unscoped or `*` grant
 * covers everything. An unscoped *question* — "can I create data at all?" —
 * is answered by any grant, since holding it somewhere is enough to justify
 * showing the control.
 */
function scopeMatches(granted: string | undefined, asked: string | undefined): boolean {
  if (!granted || granted === '*') return true
  if (!asked) return true
  return nameMatches(granted, asked)
}

function grants(
  p: RolePermission,
  resource: string,
  verb: string,
  scope: PermissionScope
): boolean {
  if (p.resource !== resource) return false
  if (!p.actions.includes(verb)) return false
  return (
    scopeMatches(p.collection, scope.collection) &&
    scopeMatches(p.tenant, scope.tenant) &&
    scopeMatches(p.alias, scope.alias) &&
    scopeMatches(p.role, scope.role) &&
    scopeMatches(p.user, scope.user) &&
    scopeMatches(p.group, scope.group)
  )
}

/** Whether the snapshot positively grants `action` within `scope`. */
export function can(
  caps: Capabilities | undefined,
  action: CapabilityAction,
  scope: PermissionScope = {}
): boolean {
  if (!caps?.resolved) return true
  const [resource, verb] = action.split('.')
  if (!resource || !verb) return true
  return caps.permissions.some((p) => grants(p, resource, verb, scope))
}

/** The inverse of `can`, for the places that read better in the negative. */
export function cannot(
  caps: Capabilities | undefined,
  action: CapabilityAction,
  scope: PermissionScope = {}
): boolean {
  return !can(caps, action, scope)
}

/** True when the user holds no write verb anywhere — the `viewer` shape. */
export function isReadOnly(caps: Capabilities | undefined): boolean {
  if (!caps?.resolved) return false
  return !caps.permissions.some((p) => p.actions.some((a) => WRITE_VERBS.includes(a)))
}

/** How to name the current user in a sentence, e.g. `windows (viewer)`. */
export function describeUser(caps: Capabilities | undefined): string {
  if (!caps?.userId) return 'this connection'
  return caps.roles.length ? `${caps.userId} (${caps.roles.join(', ')})` : caps.userId
}
