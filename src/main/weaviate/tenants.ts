import { getClient } from './connectionManager'
import type { TenantActivityStatus, TenantInfo } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Tenant CRUD for multi-tenancy-enabled collections. Activity status is the
// interesting part: ACTIVE tenants are queryable and hold RAM, INACTIVE ones are
// on local disk only, and OFFLOADED ones live in cloud storage until reactivated.

function toInfo(t: any): TenantInfo {
  return { name: t?.name, activityStatus: t?.activityStatus ?? t?.activityStatusInternal }
}

function toArray(tenants: unknown): any[] {
  if (Array.isArray(tenants)) return tenants
  return Object.values(tenants ?? {})
}

async function tenantsOf(connectionId: string, collection: string): Promise<any> {
  const client = await getClient(connectionId)
  return client.collections.get(collection).tenants
}

export async function listTenants(
  connectionId: string,
  collection: string
): Promise<TenantInfo[]> {
  try {
    const tenants = await (await tenantsOf(connectionId, collection)).get()
    return toArray(tenants)
      .map(toInfo)
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    // Multi-tenancy not enabled on this collection.
    return []
  }
}

export async function createTenants(
  connectionId: string,
  collection: string,
  names: string[]
): Promise<TenantInfo[]> {
  const clean = names.map((n) => n.trim()).filter(Boolean)
  if (clean.length === 0) throw new Error('Provide at least one tenant name')
  const api = await tenantsOf(connectionId, collection)
  const created = await api.create(clean.map((name) => ({ name })))
  return toArray(created).map(toInfo)
}

export async function removeTenants(
  connectionId: string,
  collection: string,
  names: string[]
): Promise<void> {
  if (names.length === 0) throw new Error('Provide at least one tenant name')
  const api = await tenantsOf(connectionId, collection)
  await api.remove(names)
}

/**
 * Moves tenants between ACTIVE / INACTIVE / OFFLOADED. Offloading and
 * reactivating are asynchronous on the server — the returned status may still
 * read as the old one until the transfer finishes.
 */
export async function setTenantStatus(
  connectionId: string,
  collection: string,
  names: string[],
  status: TenantActivityStatus
): Promise<TenantInfo[]> {
  if (names.length === 0) throw new Error('Provide at least one tenant name')
  const api = await tenantsOf(connectionId, collection)
  let updated: unknown
  switch (status) {
    case 'ACTIVE':
      updated = await api.activate(names)
      break
    case 'INACTIVE':
      updated = await api.deactivate(names)
      break
    case 'OFFLOADED':
      updated = await api.offload(names)
      break
    default:
      throw new Error(`Unknown tenant status: ${status}`)
  }
  return toArray(updated).map(toInfo)
}
