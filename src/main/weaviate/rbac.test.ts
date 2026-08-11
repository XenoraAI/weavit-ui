import { describe, it, expect } from 'vitest'
import {
  flattenRole,
  protectedRoleMessage,
  toSdkPermission,
  unmodeledPermissionFields,
  verbOf
} from './rbac'

describe('verbOf', () => {
  it('strips the resource suffix from an action', () => {
    expect(verbOf('read_data')).toBe('read')
    expect(verbOf('create_collections')).toBe('create')
    expect(verbOf('manage_backups')).toBe('manage')
  })

  it('leaves an action with no suffix alone', () => {
    expect(verbOf('read')).toBe('read')
  })
})

describe('unmodeledPermissionFields', () => {
  it('reports a permission kind this build does not flatten', () => {
    expect(
      unmodeledPermissionFields({
        name: 'r',
        dataPermissions: [{ collection: '*', actions: ['read_data'] }],
        quantumPermissions: [{ actions: ['read_quantum'] }]
      })
    ).toEqual(['quantumPermissions'])
  })

  it('ignores an unknown field the server left empty', () => {
    expect(unmodeledPermissionFields({ name: 'r', quantumPermissions: [] })).toEqual([])
  })

  it('finds nothing in a role made entirely of known kinds', () => {
    expect(
      unmodeledPermissionFields({
        name: 'r',
        dataPermissions: [{ collection: '*', actions: ['read_data'] }],
        usersPermissions: [{ users: '*', actions: ['read_users'] }]
      })
    ).toEqual([])
  })

  it('tolerates a missing role', () => {
    expect(unmodeledPermissionFields(undefined)).toEqual([])
  })
})

describe('flattenRole', () => {
  it('flattens per-resource arrays into one list', () => {
    const role = flattenRole({
      name: 'analyst',
      collectionsPermissions: [{ collection: 'Product', actions: ['read_collections'] }],
      dataPermissions: [{ collection: 'Product', tenant: '*', actions: ['read_data'] }]
    })
    expect(role.name).toBe('analyst')
    expect(role.permissions).toHaveLength(2)
    expect(role.permissions.map((p) => p.resource).sort()).toEqual(['collections', 'data'])
  })

  it('reduces actions to their verbs', () => {
    const role = flattenRole({
      name: 'r',
      dataPermissions: [{ collection: '*', tenant: '*', actions: ['read_data', 'create_data'] }]
    })
    expect(role.permissions[0].actions).toEqual(['read', 'create'])
  })

  it('maps each resource kind onto its scope field', () => {
    const role = flattenRole({
      name: 'r',
      rolesPermissions: [{ role: 'admin', actions: ['read_roles'] }],
      usersPermissions: [{ users: 'alice', actions: ['read_users'] }],
      groupsPermissions: [{ groupID: 'eng', groupType: 'oidc', actions: ['read_groups'] }]
    })
    const byResource = Object.fromEntries(role.permissions.map((p) => [p.resource, p]))
    expect(byResource.roles.role).toBe('admin')
    expect(byResource.users.user).toBe('alice')
    expect(byResource.groups.group).toBe('eng')
  })

  it('returns an empty permission list for a role with none', () => {
    expect(flattenRole({ name: 'empty' }).permissions).toEqual([])
  })
})

describe('toSdkPermission', () => {
  it('builds a data permission scoped to a collection and tenant', () => {
    const out = toSdkPermission({
      resource: 'data',
      collection: 'Product',
      tenant: 'acme',
      actions: { read: true, create: true }
    })
    expect(out).toEqual([
      expect.objectContaining({ collection: 'Product', tenant: 'acme' })
    ])
    expect(out[0].actions).toEqual(expect.arrayContaining(['read_data', 'create_data']))
  })

  it('defaults an unset scope to the wildcard', () => {
    const out = toSdkPermission({ resource: 'collections', actions: { read: true } })
    expect(out[0].collection).toBe('*')
  })

  it('maps CRUD verbs onto the collections builder’s own argument names', () => {
    const out = toSdkPermission({
      resource: 'collections',
      collection: 'Product',
      actions: { create: true, delete: true }
    })
    expect(out[0].actions).toEqual(
      expect.arrayContaining(['create_collections', 'delete_collections'])
    )
  })

  it('chooses the nodes builder by verbosity', () => {
    const minimal = toSdkPermission({
      resource: 'nodes',
      verbosity: 'minimal',
      actions: { read: true }
    })
    expect(minimal[0].verbosity).toBe('minimal')

    const verbose = toSdkPermission({
      resource: 'nodes',
      collection: 'Product',
      actions: { read: true }
    })
    expect(verbose[0].verbosity).toBe('verbose')
  })

  it('rejects an unknown resource rather than silently granting nothing', () => {
    expect(() => toSdkPermission({ resource: 'bogus', actions: { read: true } })).toThrow(
      /Unknown permission resource/
    )
  })
})

describe('protectedRoleMessage', () => {
  const forbidden = (role: string) =>
    new Error(
      `WeaviateInsufficientPermissionsError: Forbidden: {"error":[{"message":"assigning: modifying '${role}' role or changing its assignments is not allowed"}]}`
    )

  it('explains the refusal instead of echoing the 403 body', () => {
    const msg = protectedRoleMessage(forbidden('root'))
    expect(msg).toMatch(/protects the built-in "root" role/)
    expect(msg).not.toMatch(/Forbidden|WeaviateInsufficientPermissionsError/)
  })

  it('points read-only at viewer, since they grant the same thing', () => {
    expect(protectedRoleMessage(forbidden('read-only'))).toMatch(/assign "viewer" instead/)
  })

  it('leaves a genuine permissions failure alone', () => {
    expect(
      protectedRoleMessage(new Error('Forbidden: {"error":[{"message":"insufficient permissions"}]}'))
    ).toBeUndefined()
  })

  it('leaves an unrelated error alone', () => {
    expect(protectedRoleMessage(new Error('connect ECONNREFUSED'))).toBeUndefined()
  })
})
