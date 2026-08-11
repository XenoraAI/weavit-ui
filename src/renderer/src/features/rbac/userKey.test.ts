import { describe, it, expect } from 'vitest'
import {
  VALID_USER_ID,
  assignableRoles,
  keyFileContents,
  preserveLocked,
  roleDiff,
  roleOptions
} from './userKey'

describe('VALID_USER_ID', () => {
  it('accepts letters, numbers, underscores, hyphens and dots', () => {
    for (const id of ['analytics', 'analytics-service', 'svc_1', 'a.b.c', 'A1-_.']) {
      expect(VALID_USER_ID.test(id)).toBe(true)
    }
  })

  it('rejects spaces and characters that would break a URL path', () => {
    for (const id of ['has space', 'slash/here', 'question?', 'hash#', 'percent%', 'at@sign']) {
      expect(VALID_USER_ID.test(id)).toBe(false)
    }
  })

  it('rejects an empty id', () => {
    expect(VALID_USER_ID.test('')).toBe(false)
  })
})

describe('keyFileContents', () => {
  const issuedAt = '2026-08-10T22:30:00.000Z'

  it('labels the user, roles and issue time alongside the key', () => {
    const text = keyFileContents(
      { userId: 'analytics', apiKey: 'secret-key-123', roles: ['viewer', 'reader'] },
      issuedAt
    )
    expect(text).toContain('User:    analytics')
    expect(text).toContain('Roles:   viewer, reader')
    expect(text).toContain(`Issued:  ${issuedAt}`)
    expect(text).toContain('secret-key-123')
  })

  it('says "none" rather than leaving the roles line blank', () => {
    expect(keyFileContents({ userId: 'u', apiKey: 'k', roles: [] }, issuedAt)).toContain(
      'Roles:   none'
    )
    expect(keyFileContents({ userId: 'u', apiKey: 'k' }, issuedAt)).toContain('Roles:   none')
  })

  it('puts the key on its own line so it can be copied cleanly', () => {
    const lines = keyFileContents({ userId: 'u', apiKey: 'k' }, issuedAt).split('\n')
    expect(lines).toContain('k')
  })
})

describe('roleOptions', () => {
  it('leaves ordinary roles pickable and unlabelled', () => {
    expect(roleOptions(['analyst'])).toEqual([
      { value: 'analyst', label: 'analyst', disabled: false }
    ])
  })

  it('disables the roles Weaviate protects and says why', () => {
    const byValue = Object.fromEntries(
      roleOptions(['admin', 'read-only', 'root', 'viewer']).map((o) => [o.value, o])
    )
    expect(byValue['read-only'].disabled).toBe(true)
    expect(byValue['read-only'].label).toMatch(/cannot be assigned/)
    expect(byValue.root.disabled).toBe(true)
    // admin and viewer are assignable — the probe against 1.38.9 confirmed it.
    expect(byValue.admin.disabled).toBe(false)
    expect(byValue.viewer.disabled).toBe(false)
  })

  it('keeps protected roles visible rather than hiding them', () => {
    expect(roleOptions(['root']).map((o) => o.value)).toEqual(['root'])
  })
})

describe('assignableRoles', () => {
  it('drops the protected built-ins', () => {
    expect(assignableRoles(['admin', 'read-only', 'root', 'viewer'])).toEqual(['admin', 'viewer'])
  })

  it('is empty when only protected roles exist', () => {
    expect(assignableRoles(['root', 'read-only'])).toEqual([])
  })
})

describe('roleDiff', () => {
  it('reports nothing to do when the set is unchanged', () => {
    expect(roleDiff(['viewer'], ['viewer'])).toEqual({ added: [], removed: [] })
  })

  it('detects an added role', () => {
    expect(roleDiff(['viewer'], ['viewer', 'analyst'])).toEqual({
      added: ['analyst'],
      removed: []
    })
  })

  it('detects a removed role — the case that had no UI at all', () => {
    expect(roleDiff(['viewer', 'admin'], ['viewer'])).toEqual({
      added: [],
      removed: ['admin']
    })
  })

  it('handles a swap in one save', () => {
    expect(roleDiff(['viewer'], ['admin'])).toEqual({ added: ['admin'], removed: ['viewer'] })
  })

  it('reports removing every role', () => {
    expect(roleDiff(['viewer', 'admin'], [])).toEqual({
      added: [],
      removed: ['viewer', 'admin']
    })
  })

  it('never tries to revoke a protected built-in', () => {
    expect(roleDiff(['root', 'viewer'], [])).toEqual({ added: [], removed: ['viewer'] })
  })

  it('never tries to assign a protected built-in', () => {
    expect(roleDiff([], ['read-only', 'viewer'])).toEqual({ added: ['viewer'], removed: [] })
  })
})

describe('preserveLocked', () => {
  it('puts back a protected role the user tried to remove', () => {
    expect(preserveLocked(['root', 'viewer'], ['viewer']).sort()).toEqual(['root', 'viewer'])
  })

  it('allows removing an ordinary role', () => {
    expect(preserveLocked(['admin', 'viewer'], ['viewer'])).toEqual(['viewer'])
  })

  it('does not duplicate a protected role that is still selected', () => {
    expect(preserveLocked(['root'], ['root'])).toEqual(['root'])
  })

  it('leaves a selection alone when nothing was locked', () => {
    expect(preserveLocked(['viewer'], [])).toEqual([])
  })
})
