import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConnectionConfig, HistoryEntry, SavedQuery } from '@shared/types'

// Simple JSON-file persistence living in the OS userData dir. Connection
// profiles (non-secret) are stored as plain JSON; API keys are encrypted with
// Electron safeStorage (OS keychain) and stored separately.

function dataDir(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

const connectionsFile = () => join(dataDir(), 'weft-connections.json')
const secretsFile = () => join(dataDir(), 'weft-secrets.json')
const historyFile = () => join(dataDir(), 'weft-history.json')
const savedQueriesFile = () => join(dataDir(), 'weft-saved-queries.json')

// The userData folder is derived from the app name, so renaming the app moves
// it and would appear to lose saved connections. If the current folder has no
// connections yet, recover them from a previous app-name's folder (best effort;
// safeStorage secrets are tied to the OS keychain, not the folder, so the
// encrypted blob still decrypts on the same machine).
const LEGACY_APP_DIRS = ['weavit-ui', 'weft', 'Weft', 'Electron']

export function migrateLegacyData(): void {
  try {
    if (existsSync(connectionsFile())) return
    const appData = app.getPath('appData')
    for (const dir of LEGACY_APP_DIRS) {
      const legacyConn = join(appData, dir, 'weft-connections.json')
      if (existsSync(legacyConn) && join(appData, dir) !== dataDir()) {
        copyFileSync(legacyConn, connectionsFile())
        const legacySecrets = join(appData, dir, 'weft-secrets.json')
        if (existsSync(legacySecrets)) copyFileSync(legacySecrets, secretsFile())
        return
      }
    }
  } catch {
    /* best effort — never block startup on migration */
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback
    return JSON.parse(readFileSync(file, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8')
}

// ── Connection profiles ─────────────────────────────────────────────────────

export function loadConnections(): ConnectionConfig[] {
  return readJson<ConnectionConfig[]>(connectionsFile(), [])
}

export function saveConnections(connections: ConnectionConfig[]): void {
  writeJson(connectionsFile(), connections)
}

// ── Secrets (API keys) ──────────────────────────────────────────────────────

type SecretMap = Record<string, string> // connectionId -> base64 payload

function loadSecrets(): SecretMap {
  return readJson<SecretMap>(secretsFile(), {})
}

function persistSecrets(map: SecretMap): void {
  writeJson(secretsFile(), map)
}

const PLAIN_PREFIX = 'plain:' // fallback when OS encryption is unavailable

export function setSecret(connectionId: string, apiKey: string | null | undefined): void {
  const map = loadSecrets()
  if (!apiKey) {
    delete map[connectionId]
    persistSecrets(map)
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    map[connectionId] = safeStorage.encryptString(apiKey).toString('base64')
  } else {
    // No OS keychain (e.g. headless Linux). Degrade to base64 with a marker so
    // we never silently claim encryption we didn't do.
    map[connectionId] = PLAIN_PREFIX + Buffer.from(apiKey, 'utf-8').toString('base64')
  }
  persistSecrets(map)
}

export function getSecret(connectionId: string): string | null {
  const map = loadSecrets()
  const payload = map[connectionId]
  if (!payload) return null
  try {
    if (payload.startsWith(PLAIN_PREFIX)) {
      return Buffer.from(payload.slice(PLAIN_PREFIX.length), 'base64').toString('utf-8')
    }
    return safeStorage.decryptString(Buffer.from(payload, 'base64'))
  } catch {
    return null
  }
}

export function hasSecret(connectionId: string): boolean {
  return Boolean(loadSecrets()[connectionId])
}

export function deleteSecret(connectionId: string): void {
  const map = loadSecrets()
  delete map[connectionId]
  persistSecrets(map)
}

// ── Query history ───────────────────────────────────────────────────────────

/** Keep recent history bounded — it is a convenience, not an audit log. */
const HISTORY_LIMIT = 200

export function loadHistory(connectionId: string, collection?: string): HistoryEntry[] {
  return readJson<HistoryEntry[]>(historyFile(), []).filter(
    (h) => h.connectionId === connectionId && (!collection || h.collection === collection)
  )
}

export function recordHistory(entry: Omit<HistoryEntry, 'id' | 'at'>): HistoryEntry {
  const all = readJson<HistoryEntry[]>(historyFile(), [])
  const full: HistoryEntry = { ...entry, id: randomUUID(), at: new Date().toISOString() }
  // Newest first, and capped so the file can't grow without bound.
  writeJson(historyFile(), [full, ...all].slice(0, HISTORY_LIMIT))
  return full
}

/** Clears one connection's history, or everything when no id is given. */
export function clearHistory(connectionId?: string): void {
  if (!connectionId) {
    writeJson(historyFile(), [])
    return
  }
  const remaining = readJson<HistoryEntry[]>(historyFile(), []).filter(
    (h) => h.connectionId !== connectionId
  )
  writeJson(historyFile(), remaining)
}

// ── Saved queries ───────────────────────────────────────────────────────────

export function loadSavedQueries(): SavedQuery[] {
  return readJson<SavedQuery[]>(savedQueriesFile(), [])
}

export function saveQuery(query: Omit<SavedQuery, 'id' | 'savedAt'>): SavedQuery {
  const all = loadSavedQueries()
  const full: SavedQuery = { ...query, id: randomUUID(), savedAt: new Date().toISOString() }
  // A repeat name replaces the older entry rather than accumulating duplicates.
  const remaining = all.filter((q) => !(q.name === query.name && q.collection === query.collection))
  writeJson(savedQueriesFile(), [full, ...remaining])
  return full
}

export function deleteSavedQuery(id: string): void {
  writeJson(
    savedQueriesFile(),
    loadSavedQueries().filter((q) => q.id !== id)
  )
}
