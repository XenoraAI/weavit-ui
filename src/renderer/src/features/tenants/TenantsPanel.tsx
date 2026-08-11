import { useState } from 'react'
import {
  Box,
  Stack,
  Group,
  Text,
  Button,
  Table,
  Badge,
  Modal,
  Textarea,
  Center,
  Loader,
  Alert,
  ActionIcon,
  Checkbox,
  Tooltip,
  Code
} from '@mantine/core'
import {
  IconPlus,
  IconRefresh,
  IconTrash,
  IconAlertTriangle,
  IconPlayerPlay,
  IconPlayerPause,
  IconCloudUpload
} from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TenantActivityStatus } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'

interface Props {
  connectionId: string
  collection: string
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'teal',
  INACTIVE: 'gray',
  OFFLOADED: 'blue',
  OFFLOADING: 'yellow',
  ONLOADING: 'yellow'
}

/**
 * Tenant lifecycle. ACTIVE tenants are queryable and hold memory; INACTIVE ones
 * stay on local disk; OFFLOADED ones move to cloud storage. Offloading and
 * reactivating are asynchronous, so the status can lag the request.
 */
export function TenantsPanel({ connectionId, collection }: Props) {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [names, setNames] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const tenants = useQuery({
    queryKey: ['tenants', connectionId, collection],
    queryFn: () => api.tenants.list(connectionId, collection)
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tenants', connectionId, collection] })
    setSelected([])
  }

  const parseNames = (raw: string): string[] =>
    raw
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean)

  const create = useMutation({
    mutationFn: () => api.tenants.create(connectionId, collection, parseNames(names)),
    onSuccess: (created) => {
      notifyOk(`${created.length} tenant(s) created`)
      setCreating(false)
      setNames('')
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not create tenants')
  })

  const setStatus = useMutation({
    mutationFn: (status: TenantActivityStatus) =>
      api.tenants.setStatus(connectionId, collection, selected, status),
    onSuccess: (_r, status) => {
      notifyOk(`${selected.length} tenant(s) set to ${status}`)
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not change tenant status')
  })

  const remove = useMutation({
    mutationFn: () => api.tenants.remove(connectionId, collection, selected),
    onSuccess: () => {
      notifyOk(`${selected.length} tenant(s) deleted`)
      setConfirmDelete(false)
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not delete tenants')
  })

  const all = tenants.data ?? []
  const allSelected = all.length > 0 && selected.length === all.length

  if (tenants.isLoading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    )
  }

  return (
    <Box p="md" style={{ height: '100%', overflow: 'auto' }}>
      <Group justify="space-between" mb="md">
        <div>
          <Text fw={700}>Tenants</Text>
          <Text size="sm" c="dimmed">
            {all.length} tenants · active tenants hold memory, inactive stay on disk, offloaded move
            to cloud storage
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip label="Refresh">
            <ActionIcon variant="light" onClick={invalidate}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Button size="xs" leftSection={<IconPlus size={15} />} onClick={() => setCreating(true)}>
            Add tenants
          </Button>
        </Group>
      </Group>

      {selected.length > 0 && (
        <Group gap="xs" mb="sm">
          <Text size="sm">{selected.length} selected</Text>
          <Button
            size="compact-xs"
            variant="light"
            color="teal"
            leftSection={<IconPlayerPlay size={13} />}
            loading={setStatus.isPending}
            onClick={() => setStatus.mutate('ACTIVE')}
          >
            Activate
          </Button>
          <Button
            size="compact-xs"
            variant="light"
            color="gray"
            leftSection={<IconPlayerPause size={13} />}
            loading={setStatus.isPending}
            onClick={() => setStatus.mutate('INACTIVE')}
          >
            Deactivate
          </Button>
          <Button
            size="compact-xs"
            variant="light"
            color="blue"
            leftSection={<IconCloudUpload size={13} />}
            loading={setStatus.isPending}
            onClick={() => setStatus.mutate('OFFLOADED')}
          >
            Offload
          </Button>
          <Button
            size="compact-xs"
            variant="light"
            color="red"
            leftSection={<IconTrash size={13} />}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        </Group>
      )}

      {all.length === 0 ? (
        <Text c="dimmed">No tenants yet.</Text>
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40}>
                <Checkbox
                  size="xs"
                  checked={allSelected}
                  indeterminate={selected.length > 0 && !allSelected}
                  onChange={(e) => setSelected(e.currentTarget.checked ? all.map((t) => t.name) : [])}
                />
              </Table.Th>
              <Table.Th>Tenant</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {all.map((t) => (
              <Table.Tr key={t.name}>
                <Table.Td>
                  <Checkbox
                    size="xs"
                    checked={selected.includes(t.name)}
                    onChange={(e) =>
                      setSelected((s) =>
                        e.currentTarget.checked ? [...s, t.name] : s.filter((n) => n !== t.name)
                      )
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Code>{t.name}</Code>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={STATUS_COLOR[t.activityStatus ?? ''] ?? 'gray'}>
                    {t.activityStatus ?? 'unknown'}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={creating} onClose={() => setCreating(false)} title="Add tenants" centered>
        <Stack gap="sm">
          <Textarea
            label="Tenant names"
            description="One per line, or comma separated"
            placeholder={'acme-corp\nglobex\ninitech'}
            autosize
            minRows={4}
            value={names}
            onChange={(e) => setNames(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              disabled={parseNames(names).length === 0}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              Create {parseNames(names).length || ''}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete tenants"
        centered
      >
        <Stack gap="sm">
          <Alert color="red" icon={<IconAlertTriangle />}>
            This permanently deletes {selected.length} tenant(s) and every object inside them. This
            cannot be undone.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button color="red" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  )
}
