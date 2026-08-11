import { describe, it, expect, vi } from 'vitest'
import { buildCapabilities } from './permissions'
import { can, isReadOnly } from '@shared/permissions'

// The role payloads below are what Weaviate 1.32.9 actually returns from
// `getMyUser` for its two built-in roles, trimmed to the fields that matter.

const VIEWER_ROLE = {
  name: 'viewer',
  backupsPermissions: [],
  clusterPermissions: [{ actions: ['read_cluster'] }],
  collectionsPermissions: [{ collection: '*', actions: ['read_collections'] }],
  dataPermissions: [{ collection: '*', tenant: '*', actions: ['read_data'] }],
  rolesPermissions: [{ role: '*', actions: ['read_roles'] }],
  usersPermissions: [{ users: '*', actions: ['read_users'] }]
}

const ROOT_ROLE = {
  name: 'root',
  backupsPermissions: [{ collection: '*', actions: ['manage_backups'] }],
  collectionsPermissions: [
    {
      collection: '*',
      actions: ['create_collections', 'read_collections', 'update_collections']
    }
  ],
  dataPermissions: [
    { collection: '*', tenant: '*', actions: ['create_data', 'read_data', 'update_data'] }
  ],
  usersPermissions: [{ users: '*', actions: ['create_users', 'read_users'] }]
}

const noFetch = () => {
  throw new Error('should not have been called')
}

describe('buildCapabilities', () => {
  it('resolves a viewer from the roles getMyUser already inlined', async () => {
    const fetchRole = vi.fn()
    const caps = await buildCapabilities({ id: 'viewer-user', roles: [VIEWER_ROLE] }, fetchRole)

    expect(caps.resolved).toBe(true)
    expect(caps.userId).toBe('viewer-user')
    expect(caps.roles).toEqual(['viewer'])
    // No second round-trip: the payload already carried the permissions.
    expect(fetchRole).not.toHaveBeenCalled()

    expect(can(caps, 'data.read', { collection: 'SampleWebsites' })).toBe(true)
    expect(can(caps, 'data.update', { collection: 'SampleWebsites' })).toBe(false)
    expect(can(caps, 'users.create')).toBe(false)
    expect(isReadOnly(caps)).toBe(true)
  })

  it('resolves root as anything but read-only', async () => {
    const caps = await buildCapabilities({ id: 'root-user', roles: [ROOT_ROLE] }, noFetch)
    expect(caps.resolved).toBe(true)
    expect(can(caps, 'users.create')).toBe(true)
    expect(can(caps, 'data.update', { collection: 'Anything' })).toBe(true)
    expect(isReadOnly(caps)).toBe(false)
  })

  it('merges the permissions of every role held', async () => {
    const caps = await buildCapabilities(
      { id: 'mixed', roles: [VIEWER_ROLE, { name: 'writer', dataPermissions: [{ collection: 'Products', tenant: '*', actions: ['update_data'] }] }] },
      noFetch
    )
    expect(caps.roles).toEqual(['viewer', 'writer'])
    expect(can(caps, 'data.update', { collection: 'Products' })).toBe(true)
    expect(can(caps, 'data.update', { collection: 'Orders' })).toBe(false)
    expect(can(caps, 'data.read', { collection: 'Orders' })).toBe(true)
    expect(isReadOnly(caps)).toBe(false)
  })

  it('fetches a role that arrived as a bare name', async () => {
    const fetchRole = vi.fn().mockResolvedValue(VIEWER_ROLE)
    const caps = await buildCapabilities({ id: 'u', roleNames: ['viewer'] }, fetchRole)
    expect(fetchRole).toHaveBeenCalledWith('viewer')
    expect(caps.resolved).toBe(true)
    expect(isReadOnly(caps)).toBe(true)
  })

  it('reads roles out of a name-keyed record too', async () => {
    const caps = await buildCapabilities({ id: 'u', roles: { viewer: VIEWER_ROLE } }, noFetch)
    expect(caps.resolved).toBe(true)
    expect(caps.roles).toEqual(['viewer'])
  })

  // Everything below must come back unresolved, which the matcher reads as
  // "allow everything" — the app then behaves exactly as it did before.

  it('gives up when a role cannot be read', async () => {
    const caps = await buildCapabilities(
      { id: 'u', roleNames: ['secret'] },
      () => Promise.reject(new Error('insufficient permissions to read_roles'))
    )
    expect(caps.resolved).toBe(false)
    expect(caps.note).toMatch(/could not be read/)
    expect(can(caps, 'data.update')).toBe(true)
  })

  it('gives up when a role fetch comes back empty', async () => {
    const caps = await buildCapabilities({ id: 'u', roleNames: ['ghost'] }, async () => null)
    expect(caps.resolved).toBe(false)
  })

  it('gives up when the current user has no roles to speak of', async () => {
    const caps = await buildCapabilities({ id: 'u' }, noFetch)
    expect(caps.resolved).toBe(false)
    expect(caps.userId).toBe('u')
    expect(can(caps, 'users.create')).toBe(true)
  })

  it('gives up on a role granting a permission kind it does not model', async () => {
    const caps = await buildCapabilities(
      { id: 'u', roles: [{ ...VIEWER_ROLE, quantumPermissions: [{ actions: ['read_quantum'] }] }] },
      noFetch
    )
    expect(caps.resolved).toBe(false)
    expect(caps.note).toMatch(/quantumPermissions/)
  })

  it('gives up on a role that lists no permissions at all', async () => {
    const caps = await buildCapabilities({ id: 'u', roles: [{ name: 'opaque' }] }, async () => ({
      name: 'opaque'
    }))
    expect(caps.resolved).toBe(false)
    expect(caps.note).toMatch(/listed no permissions/)
  })
})
