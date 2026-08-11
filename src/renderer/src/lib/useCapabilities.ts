import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { can, type CapabilityAction, type PermissionScope } from '@shared/permissions'
import { api } from './api'

/**
 * The connected user's permissions, as one snapshot per connection.
 *
 * React Query is the only cache: the main process rebuilds the snapshot on
 * every call, so there is a single place to invalidate — this key — and no
 * second copy to keep in step. Roles change rarely enough that a long stale
 * time costs nothing; anything that edits roles should invalidate
 * `['capabilities']` alongside its own key.
 */
export function useCapabilities(connectionId?: string) {
  return useQuery({
    queryKey: ['capabilities', connectionId],
    queryFn: () => api.rbac.getCapabilities(connectionId!),
    enabled: !!connectionId,
    staleTime: 5 * 60_000,
    // An instance without RBAC answers with an unresolved snapshot rather than
    // an error, so a failure here is the connection itself — not worth a retry.
    retry: false
  })
}

/**
 * `can('data.update', { collection })` for a connection. While the snapshot is
 * loading, missing or unresolved this answers true for everything, so a control
 * is never briefly disabled on the way to being allowed.
 */
export function useCan(connectionId?: string) {
  const { data } = useCapabilities(connectionId)
  return useCallback(
    (action: CapabilityAction, scope?: PermissionScope) => can(data, action, scope),
    [data]
  )
}
