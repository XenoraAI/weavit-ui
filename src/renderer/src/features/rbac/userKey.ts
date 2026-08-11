import { isLockedRole } from '@shared/types'

// Pure helpers for the users tab. Kept apart from the panel so they are
// testable without a renderer environment.

/** An option for a role picker, greying out the ones Weaviate won't assign. */
export interface RoleOption {
  value: string
  label: string
  disabled: boolean
}

/**
 * Weaviate refuses to assign its protected built-ins, so offering them is a
 * dead end. They stay visible — hiding a role the server clearly lists would be
 * more confusing than showing why it can't be picked.
 */
export function roleOptions(roleNames: string[]): RoleOption[] {
  return roleNames.map((name) => ({
    value: name,
    label: isLockedRole(name) ? `${name} — built-in, cannot be assigned` : name,
    disabled: isLockedRole(name)
  }))
}

/** The roles a user could actually be given. */
export function assignableRoles(roleNames: string[]): string[] {
  return roleNames.filter((name) => !isLockedRole(name))
}

export interface RoleDiff {
  added: string[]
  removed: string[]
}

/**
 * What has to change to get a user from `original` roles to `next`. Protected
 * built-ins are excluded from both lists: Weaviate refuses to assign or revoke
 * them, so sending either would fail the whole save for no gain.
 */
export function roleDiff(original: string[], next: string[]): RoleDiff {
  const changeable = (name: string): boolean => !isLockedRole(name)
  return {
    added: next.filter((r) => !original.includes(r)).filter(changeable),
    removed: original.filter((r) => !next.includes(r)).filter(changeable)
  }
}

/**
 * Keeps any protected role the user already holds in the selection, since it
 * cannot be revoked — removing its chip would promise a change we can't make.
 */
export function preserveLocked(original: string[], next: string[]): string[] {
  const locked = original.filter(isLockedRole)
  return [...new Set([...next, ...locked])]
}

export interface IssuedKey {
  userId: string
  apiKey: string
  /** Roles that were successfully assigned alongside the key. */
  roles?: string[]
  /** Set when the user was created but the role assignment failed. */
  roleError?: string
}

/** The user id becomes part of a URL path, so keep it to safe characters. */
export const VALID_USER_ID = /^[A-Za-z0-9._-]+$/

export const USER_ID_HINT = 'Only letters, numbers, underscores, hyphens and dots are allowed.'

/** The file body written by Download — labelled so it is readable a year later. */
export function keyFileContents(issued: IssuedKey, issuedAt: string): string {
  return [
    'Weaviate API key',
    `User:    ${issued.userId}`,
    `Roles:   ${issued.roles?.length ? issued.roles.join(', ') : 'none'}`,
    `Issued:  ${issuedAt}`,
    '',
    issued.apiKey,
    ''
  ].join('\n')
}
