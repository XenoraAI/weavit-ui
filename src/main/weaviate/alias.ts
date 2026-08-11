import { getClient } from './connectionManager'
import type { AliasInfo } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Aliases are a stable name pointing at a collection. The usual reason to reach
// for one is a rebuild: index into Products_v2, then repoint the alias so
// readers switch over atomically without touching their query code.

function toInfo(raw: any): AliasInfo {
  return { alias: raw?.alias, collection: raw?.collection }
}

export async function listAliases(
  connectionId: string,
  collection?: string
): Promise<AliasInfo[]> {
  const client = await getClient(connectionId)
  const all = await client.alias.listAll(collection ? { collection } : undefined)
  const arr = Array.isArray(all) ? all : Object.values(all ?? {})
  return arr.map(toInfo).sort((a, b) => a.alias.localeCompare(b.alias))
}

export async function getAlias(connectionId: string, alias: string): Promise<AliasInfo | null> {
  const client = await getClient(connectionId)
  try {
    const raw = await client.alias.get(alias)
    return raw ? toInfo(raw) : null
  } catch {
    // The server 404s for an unknown alias; the UI treats that as "not found".
    return null
  }
}

export async function createAlias(
  connectionId: string,
  alias: string,
  collection: string
): Promise<void> {
  const client = await getClient(connectionId)
  await client.alias.create({ alias, collection })
}

/**
 * Repoints an existing alias at a different collection. Weaviate has no way to
 * rename an alias in place — that needs a delete plus a create.
 */
export async function updateAlias(
  connectionId: string,
  alias: string,
  newTargetCollection: string
): Promise<void> {
  const client = await getClient(connectionId)
  await client.alias.update({ alias, newTargetCollection })
}

export async function deleteAlias(connectionId: string, alias: string): Promise<void> {
  const client = await getClient(connectionId)
  await client.alias.delete(alias)
}
