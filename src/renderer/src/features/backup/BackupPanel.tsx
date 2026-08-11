import { useEffect, useState } from 'react'
import {
  Box,
  Stack,
  Group,
  Text,
  Button,
  Table,
  Badge,
  Modal,
  TextInput,
  Select,
  MultiSelect,
  NumberInput,
  Switch,
  Center,
  Loader,
  Alert,
  ActionIcon,
  Tooltip,
  Code,
  SegmentedControl
} from '@mantine/core'
import {
  IconPlus,
  IconRefresh,
  IconAlertTriangle,
  IconRestore,
  IconPlayerStop,
  IconInfoCircle
} from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BackupBackend, BackupCompressionLevel, BackupInfo } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'

interface Props {
  connectionId: string
}

const BACKENDS: BackupBackend[] = ['filesystem', 's3', 'gcs', 'azure']
const COMPRESSION: BackupCompressionLevel[] = [
  'DefaultCompression',
  'BestSpeed',
  'BestCompression',
  'ZstdBestSpeed',
  'ZstdDefaultCompression',
  'ZstdBestCompression',
  'NoCompression'
]

/** Terminal states stop the poller; anything else is still in flight. */
const RUNNING = new Set(['STARTED', 'TRANSFERRING', 'TRANSFERRED'])

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'teal',
  FAILED: 'red',
  CANCELED: 'orange',
  STARTED: 'yellow',
  TRANSFERRING: 'yellow',
  TRANSFERRED: 'blue'
}

export function BackupPanel({ connectionId }: Props) {
  const qc = useQueryClient()
  const [backend, setBackend] = useState<BackupBackend>('filesystem')
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<BackupInfo | null>(null)

  // New-backup form
  const [backupId, setBackupId] = useState('')
  const [include, setInclude] = useState<string[]>([])
  const [compression, setCompression] = useState<BackupCompressionLevel>('DefaultCompression')
  const [cpuPercentage, setCpuPercentage] = useState(50)
  const [overwriteAlias, setOverwriteAlias] = useState(false)

  /** Anything mid-transfer is re-read on a timer so progress is visible. */
  const [watching, setWatching] = useState<{ id: string; operation: 'create' | 'restore' } | null>(
    null
  )

  const backups = useQuery({
    queryKey: ['backups', connectionId, backend],
    queryFn: () => api.backup.list(connectionId, backend)
  })

  const collections = useQuery({
    queryKey: ['collections', connectionId],
    queryFn: () => api.schema.listCollections(connectionId)
  })

  const watched = useQuery({
    queryKey: ['backupStatus', connectionId, backend, watching?.id, watching?.operation],
    queryFn: () =>
      watching!.operation === 'create'
        ? api.backup.createStatus({ connectionId, backupId: watching!.id, backend })
        : api.backup.restoreStatus({ connectionId, backupId: watching!.id, backend }),
    enabled: watching !== null,
    // Poll while the job is live, then settle and refresh the list.
    refetchInterval: (q) => (RUNNING.has(q.state.data?.status ?? '') ? 2000 : false)
  })

  // Once the watched job reaches a terminal state, stop polling and pick the
  // finished record up from the list.
  useEffect(() => {
    if (!watching || !watched.data || RUNNING.has(watched.data.status)) return
    setWatching(null)
    qc.invalidateQueries({ queryKey: ['backups', connectionId] })
  }, [watching, watched.data, qc, connectionId])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['backups', connectionId, backend] })

  const create = useMutation({
    mutationFn: () =>
      api.backup.create({
        connectionId,
        backupId: backupId.trim(),
        backend,
        includeCollections: include.length ? include : undefined,
        compressionLevel: compression,
        cpuPercentage
      }),
    onSuccess: (info) => {
      notifyOk(`Backup ${info.id} started`)
      setCreating(false)
      setWatching({ id: info.id, operation: 'create' })
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Backup failed to start')
  })

  const restore = useMutation({
    mutationFn: () =>
      api.backup.restore({
        connectionId,
        backupId: restoring!.id,
        backend,
        overwriteAlias
      }),
    onSuccess: (info) => {
      notifyOk(`Restore of ${info.id} started`)
      setRestoring(null)
      setWatching({ id: info.id, operation: 'restore' })
    },
    onError: (e) => notifyErr(e, 'Restore failed to start')
  })

  const cancel = useMutation({
    mutationFn: (info: BackupInfo) =>
      api.backup.cancel({ connectionId, backupId: info.id, backend, operation: 'create' }),
    onSuccess: () => {
      notifyOk('Cancellation requested')
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not cancel')
  })

  const collectionNames = (collections.data ?? []).map((c) => c.name)
  // `available === false` is the server telling us the backend isn't enabled,
  // which is different from the request having failed.
  const unavailable = backups.data?.available === false
  const available = backups.data?.available === true
  const rows = backups.data?.backups ?? []

  return (
    <Box p="md" style={{ height: '100%', overflow: 'auto' }}>
      <Group justify="space-between" mb="md">
        <div>
          <Text fw={700} size="lg">
            Backup &amp; restore
          </Text>
          <Text size="sm" c="dimmed">
            Snapshots of collections written to a configured storage backend. The backend must be
            enabled on the server before it appears here.
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip label="Refresh">
            <ActionIcon variant="light" onClick={invalidate}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={`The ${backend} backend is not enabled on this server`}
            disabled={!unavailable}
          >
            {/* A span keeps the tooltip working over a disabled button. */}
            <span>
              <Button
                size="xs"
                leftSection={<IconPlus size={15} />}
                disabled={unavailable}
                onClick={() => setCreating(true)}
              >
                New backup
              </Button>
            </span>
          </Tooltip>
        </Group>
      </Group>

      <SegmentedControl
        size="xs"
        mb="md"
        data={BACKENDS}
        value={backend}
        onChange={(v) => setBackend(v as BackupBackend)}
      />

      {watched.data && RUNNING.has(watched.data.status) && (
        <Alert color="blue" mb="md" icon={<Loader size="xs" />}>
          {watching?.operation === 'restore' ? 'Restoring' : 'Backing up'}{' '}
          <Code>{watched.data.id}</Code> — {watched.data.status}
        </Alert>
      )}

      {backups.isLoading && (
        <Center h={160}>
          <Loader />
        </Center>
      )}
      {backups.isError && (
        <Alert color="red" icon={<IconAlertTriangle />} title="Could not list backups">
          {(backups.error as Error).message}
        </Alert>
      )}

      {/* Not a failure: the server simply has no module for this backend. */}
      {unavailable && (
        <Alert color="gray" icon={<IconInfoCircle />} title="No backup backend configured">
          <Stack gap="xs">
            <Text size="sm">
              {backups.data?.reason ?? 'This backend is not enabled on the server.'} Backups to{' '}
              <Code>{backend}</Code> cannot be created or listed until it is.
            </Text>
            <Text size="xs" c="dimmed">
              Enable it by adding <Code>backup-{backend}</Code> to the server&apos;s{' '}
              <Code>ENABLE_MODULES</Code> and configuring its storage location, then reconnect.
            </Text>
          </Stack>
        </Alert>
      )}

      {available && rows.length === 0 && <Text c="dimmed">No backups in this backend yet.</Text>}

      {rows.length > 0 && (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Collections</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th w={120} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td>
                  <Code>{b.id}</Code>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={STATUS_COLOR[b.status] ?? 'gray'}>
                    {b.status}
                  </Badge>
                  {b.error && (
                    <Text size="xs" c="red" mt={2}>
                      {b.error}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed" className="weft-truncate">
                    {b.collections?.join(', ') || 'all'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {b.startedAt ? new Date(b.startedAt).toLocaleString() : '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end">
                    {RUNNING.has(b.status) ? (
                      <Tooltip label="Cancel">
                        <ActionIcon variant="subtle" color="orange" onClick={() => cancel.mutate(b)}>
                          <IconPlayerStop size={16} />
                        </ActionIcon>
                      </Tooltip>
                    ) : (
                      <Tooltip label="Restore">
                        <ActionIcon
                          variant="subtle"
                          disabled={b.status !== 'SUCCESS'}
                          onClick={() => setRestoring(b)}
                        >
                          <IconRestore size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={creating} onClose={() => setCreating(false)} title="New backup" centered>
        <Stack gap="sm">
          <TextInput
            label="Backup ID"
            description="Lowercase letters, numbers and dashes"
            placeholder="nightly-2026-08-10"
            value={backupId}
            onChange={(e) => setBackupId(e.currentTarget.value)}
          />
          <MultiSelect
            label="Collections"
            description="Leave empty to back up everything"
            searchable
            clearable
            data={collectionNames}
            value={include}
            onChange={setInclude}
          />
          <Select
            label="Compression"
            data={COMPRESSION}
            value={compression}
            onChange={(v) => setCompression((v as BackupCompressionLevel) ?? 'DefaultCompression')}
          />
          <NumberInput
            label="CPU budget (%)"
            description="How much CPU the backup job may use"
            min={1}
            max={80}
            value={cpuPercentage}
            onChange={(v) => setCpuPercentage(Number(v))}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              disabled={!backupId.trim()}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              Start backup
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={restoring !== null}
        onClose={() => setRestoring(null)}
        title="Restore backup"
        centered
      >
        <Stack gap="sm">
          <Alert color="orange" icon={<IconAlertTriangle />}>
            Restoring recreates the collections in <Code>{restoring?.id}</Code>. Weaviate refuses to
            restore a collection that already exists — delete it first if you mean to replace it.
          </Alert>
          <Switch
            label="Overwrite conflicting aliases"
            checked={overwriteAlias}
            onChange={(e) => setOverwriteAlias(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRestoring(null)}>
              Cancel
            </Button>
            <Button color="orange" loading={restore.isPending} onClick={() => restore.mutate()}>
              Restore
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  )
}
