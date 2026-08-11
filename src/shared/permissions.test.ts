import { describe, it, expect } from 'vitest'
import { can, cannot, describeUser, isReadOnly } from './permissions'
import type { Capabilities, RolePermission } from './types'

const perm = (p: Partial<RolePermission> & Pick<RolePermission, 'resource' | 'actions'>) =>
  p as RolePermission

const caps = (permissions: RolePermission[], over: Partial<Capabilities> = {}): Capabilities => ({
  resolved: true,
  userId: 'windows',
  roles: ['viewer'],
  permissions,
  ...over
})

/** What Weaviate's built-in `viewer` grants: read on everything. */
const viewer = caps([
  perm({ resource: 'data', actions: ['read'], collection: '*', tenant: '*' }),
  perm({ resource: 'collections', actions: ['read'], collection: '*' }),
  perm({ resource: 'users', actions: ['read'], user: '*' })
])

describe('can', () => {
  it('allows everything when there is no snapshot at all', () => {
    expect(can(undefined, 'data.update')).toBe(true)
    expect(can(undefined, 'users.create')).toBe(true)
  })

  it('allows everything when the snapshot could not be resolved', () => {
    const unresolved = caps([], { resolved: false, note: 'RBAC is not enabled' })
    expect(can(unresolved, 'data.delete')).toBe(true)
    expect(can(unresolved, 'users.create')).toBe(true)
  })

  it('grants what a resolved snapshot covers', () => {
    expect(can(viewer, 'data.read')).toBe(true)
    expect(can(viewer, 'data.read', { collection: 'SampleWebsites' })).toBe(true)
  })

  it('refuses a verb the snapshot does not hold', () => {
    expect(can(viewer, 'data.update', { collection: 'SampleWebsites' })).toBe(false)
    expect(can(viewer, 'users.create')).toBe(false)
    expect(cannot(viewer, 'users.create')).toBe(true)
  })

  it('refuses a resource the snapshot says nothing about', () => {
    expect(can(viewer, 'backups.manage')).toBe(false)
  })

  it('honours a grant scoped to one collection', () => {
    const scoped = caps([perm({ resource: 'data', actions: ['update'], collection: 'Products' })])
    expect(can(scoped, 'data.update', { collection: 'Products' })).toBe(true)
    expect(can(scoped, 'data.update', { collection: 'Orders' })).toBe(false)
  })

  it('matches a wildcard pattern in the granted name', () => {
    const scoped = caps([perm({ resource: 'data', actions: ['update'], collection: 'Prod*' })])
    expect(can(scoped, 'data.update', { collection: 'Products' })).toBe(true)
    expect(can(scoped, 'data.update', { collection: 'Staging' })).toBe(false)
  })

  it('ignores the case Weaviate applies to collection names', () => {
    const scoped = caps([perm({ resource: 'data', actions: ['update'], collection: 'products' })])
    expect(can(scoped, 'data.update', { collection: 'Products' })).toBe(true)
  })

  it('answers an unscoped question with any grant, however narrow', () => {
    const scoped = caps([perm({ resource: 'data', actions: ['update'], collection: 'Products' })])
    expect(can(scoped, 'data.update')).toBe(true)
  })

  it('separates tenants within a collection', () => {
    const scoped = caps([
      perm({ resource: 'data', actions: ['update'], collection: '*', tenant: 'acme' })
    ])
    expect(can(scoped, 'data.update', { collection: 'Docs', tenant: 'acme' })).toBe(true)
    expect(can(scoped, 'data.update', { collection: 'Docs', tenant: 'globex' })).toBe(false)
  })

  it('allows an action it cannot parse', () => {
    expect(can(viewer, 'nonsense' as never)).toBe(true)
  })
})

describe('isReadOnly', () => {
  it('is true when no write verb is held anywhere', () => {
    expect(isReadOnly(viewer)).toBe(true)
  })

  it('is false as soon as one write verb appears', () => {
    const writer = caps([
      ...viewer.permissions,
      perm({ resource: 'data', actions: ['create'], collection: 'Products' })
    ])
    expect(isReadOnly(writer)).toBe(false)
  })

  // Unresolved means "we don't know", and claiming read-only would put a
  // read-only badge on a connection that is nothing of the sort.
  it('is false when the snapshot is unresolved, however empty', () => {
    expect(isReadOnly(caps([], { resolved: false }))).toBe(false)
    expect(isReadOnly(undefined)).toBe(false)
  })
})

describe('describeUser', () => {
  it('names the user and their roles', () => {
    expect(describeUser(viewer)).toBe('windows (viewer)')
  })

  it('falls back when there is no user to name', () => {
    expect(describeUser(caps([], { userId: undefined }))).toBe('this connection')
    expect(describeUser(caps([], { roles: [] }))).toBe('windows')
  })
})
