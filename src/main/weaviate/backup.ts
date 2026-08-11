import { getClient } from './connectionManager'
import { errorMessage, normalizeForIpc } from '../util'
import type {
  BackupBackend,
  BackupCancelRequest,
  BackupInfo,
  BackupListResult,
  BackupRequest,
  BackupStatusRequest
} from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Backup and restore. The UI never blocks on completion — it kicks the job off
// and polls the status endpoint — so `waitForCompletion` defaults to false and
// the create/restore calls return as soon as Weaviate accepts the job.

function toInfo(raw: any): BackupInfo {
  return normalizeForIpc<BackupInfo>({
    id: raw?.id,
    status: raw?.status,
    path: raw?.path,
    error: raw?.error,
    backend: raw?.backend,
    collections: raw?.collections,
    startedAt: raw?.startedAt,
    completedAt: raw?.completedAt,
    size: raw?.size
  })
}

function commonArgs(req: BackupRequest): any {
  const args: any = {
    backupId: req.backupId,
    backend: req.backend,
    waitForCompletion: req.waitForCompletion ?? false
  }
  if (req.includeCollections?.length) args.includeCollections = req.includeCollections
  if (req.excludeCollections?.length) args.excludeCollections = req.excludeCollections
  return args
}

export async function createBackup(req: BackupRequest): Promise<BackupInfo> {
  if (!req.backupId.trim()) throw new Error('Backup ID is required')
  if (req.includeCollections?.length && req.excludeCollections?.length) {
    throw new Error('Choose either an include list or an exclude list, not both')
  }
  const client = await getClient(req.connectionId)
  const config: any = {}
  if (req.compressionLevel) config.compressionLevel = req.compressionLevel
  if (req.cpuPercentage != null) config.cpuPercentage = req.cpuPercentage

  const args = commonArgs(req)
  if (Object.keys(config).length) args.config = config
  return toInfo(await client.backup.create(args))
}

export async function restoreBackup(req: BackupRequest): Promise<BackupInfo> {
  if (!req.backupId.trim()) throw new Error('Backup ID is required')
  const client = await getClient(req.connectionId)
  const config: any = {}
  if (req.cpuPercentage != null) config.cpuPercentage = req.cpuPercentage
  if (req.overwriteAlias != null) config.overwriteAlias = req.overwriteAlias

  const args = commonArgs(req)
  if (Object.keys(config).length) args.config = config
  return toInfo(await client.backup.restore(args))
}

export async function createStatus(req: BackupStatusRequest): Promise<BackupInfo> {
  const client = await getClient(req.connectionId)
  return toInfo(
    await client.backup.getCreateStatus({ backupId: req.backupId, backend: req.backend })
  )
}

export async function restoreStatus(req: BackupStatusRequest): Promise<BackupInfo> {
  const client = await getClient(req.connectionId)
  return toInfo(
    await client.backup.getRestoreStatus({ backupId: req.backupId, backend: req.backend })
  )
}

export async function cancelBackup(req: BackupCancelRequest): Promise<boolean> {
  const client = await getClient(req.connectionId)
  return client.backup.cancel({
    backupId: req.backupId,
    backend: req.backend,
    operation: req.operation ?? 'create'
  })
}

/**
 * Weaviate answers with 422 "no backup backend" when the module for a backend
 * isn't enabled. Every backend the UI offers is unconfigured until someone
 * turns it on server-side, so that answer is the common case rather than a
 * fault, and the caller should say so plainly instead of raising an error.
 */
export function unavailableReason(e: unknown): string | undefined {
  const msg = errorMessage(e)
  if (/no backup backend/i.test(msg)) return 'This backend is not enabled on the server.'
  if (/backup backend .*(not found|not enabled|unknown)/i.test(msg)) {
    return 'This backend is not enabled on the server.'
  }
  if (/unknown backup backend/i.test(msg)) return 'The server does not recognise this backend.'
  return undefined
}

export async function listBackups(
  connectionId: string,
  backend: BackupBackend
): Promise<BackupListResult> {
  const client = await getClient(connectionId)
  try {
    const all = await client.backup.list(backend)
    return { backups: (Array.isArray(all) ? all : []).map(toInfo), available: true }
  } catch (e) {
    const reason = unavailableReason(e)
    // Anything else is a genuine failure and should still surface as one.
    if (!reason) throw e
    return { backups: [], available: false, reason }
  }
}
