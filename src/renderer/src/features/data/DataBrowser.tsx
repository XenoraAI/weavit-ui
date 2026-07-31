import { useMemo, useState } from 'react'
import {
  Group,
  Button,
  Switch,
  Select,
  Text,
  ActionIcon,
  Table,
  Box,
  Stack,
  Center,
  Loader,
  Alert,
  Tooltip,
  Badge
} from '@mantine/core'
import {
  IconPlus,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconAlertTriangle
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { WeaviateObject } from '@shared/types'
import { api } from '../../lib/api'
import { ObjectDrawer } from './ObjectDrawer'
import { InsertModal } from './InsertModal'

interface Props {
  connectionId: string
  collection: string
  tenant?: string
  mtEnabled: boolean
}

const PAGE_SIZES = ['10', '25', '50', '100']

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function DataBrowser({ connectionId, collection, tenant, mtEnabled }: Props) {
  const qc = useQueryClient()
  const [limit, setLimit] = useState(25)
  const [page, setPage] = useState(0)
  const [includeVector, setIncludeVector] = useState(false)
  const [selected, setSelected] = useState<WeaviateObject | null>(null)
  const [insertOpen, setInsertOpen] = useState(false)

  const offset = page * limit
  const needsTenant = mtEnabled && !tenant

  const objectsKey = ['objects', connectionId, collection, tenant, limit, offset, includeVector]
  const objects = useQuery({
    queryKey: objectsKey,
    queryFn: () =>
      api.data.fetchObjects({ connectionId, collection, tenant, limit, offset, includeVector }),
    enabled: !needsTenant
  })

  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const o of objects.data?.objects ?? []) {
      for (const k of Object.keys(o.properties)) keys.add(k)
    }
    return [...keys]
  }, [objects.data])

  const refresh = () => qc.invalidateQueries({ queryKey: ['objects', connectionId, collection] })
  const total = objects.data?.totalCount

  if (needsTenant) {
    return (
      <Center h="100%">
        <Alert color="grape" icon={<IconAlertTriangle />} title="Select a tenant" maw={460}>
          This collection has multi-tenancy enabled. Choose a tenant from the selector above to view
          its objects.
        </Alert>
      </Center>
    )
  }

  return (
    <Stack h="100%" gap={0}>
      <Group justify="space-between" px="md" py="xs" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            leftSection={<IconPlus size={15} />}
            onClick={() => setInsertOpen(true)}
          >
            Insert object
          </Button>
          <Tooltip label="Refresh">
            <ActionIcon variant="light" onClick={refresh}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Switch
            size="xs"
            label="Include vectors"
            checked={includeVector}
            onChange={(e) => setIncludeVector(e.currentTarget.checked)}
          />
        </Group>

        <Group gap="xs" wrap="nowrap">
          {total !== undefined && (
            <Badge variant="light" color="gray">
              {total} objects
            </Badge>
          )}
          <Select
            size="xs"
            w={80}
            data={PAGE_SIZES}
            value={String(limit)}
            onChange={(v) => {
              setLimit(Number(v))
              setPage(0)
            }}
          />
          <Text size="xs" c="dimmed">
            {offset + 1}–{offset + (objects.data?.objects.length ?? 0)}
          </Text>
          <ActionIcon variant="default" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <IconChevronLeft size={16} />
          </ActionIcon>
          <ActionIcon
            variant="default"
            disabled={(objects.data?.objects.length ?? 0) < limit}
            onClick={() => setPage((p) => p + 1)}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
      </Group>

      <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }} px="md" pb="md">
        {objects.isLoading && (
          <Center h={200}>
            <Loader />
          </Center>
        )}
        {objects.isError && (
          <Alert color="red" icon={<IconAlertTriangle />} title="Failed to load objects">
            {(objects.error as Error).message}
          </Alert>
        )}
        {objects.data && objects.data.objects.length === 0 && (
          <Center h={200}>
            <Text c="dimmed">No objects on this page.</Text>
          </Center>
        )}
        {objects.data && objects.data.objects.length > 0 && (
          <Table
            striped
            highlightOnHover
            withTableBorder
            stickyHeader
            className="weft-mono"
            style={{ fontSize: 12.5 }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ minWidth: 130 }}>id</Table.Th>
                {columns.map((c) => (
                  <Table.Th key={c} style={{ minWidth: 120 }}>
                    {c}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {objects.data.objects.map((o) => (
                <Table.Tr
                  key={o.uuid}
                  className="weft-clickable"
                  onClick={() => setSelected(o)}
                >
                  <Table.Td>
                    <Text size="xs" c="aqua.4" title={o.uuid}>
                      {o.uuid.slice(0, 8)}…
                    </Text>
                  </Table.Td>
                  {columns.map((c) => (
                    <Table.Td key={c}>
                      <div className="weft-truncate" title={cellText(o.properties[c])}>
                        {cellText(o.properties[c])}
                      </div>
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Box>

      {selected && (
        <ObjectDrawer
          connectionId={connectionId}
          collection={collection}
          tenant={tenant}
          object={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            refresh()
            setSelected(null)
          }}
        />
      )}

      {insertOpen && (
        <InsertModal
          connectionId={connectionId}
          collection={collection}
          tenant={tenant}
          onClose={() => setInsertOpen(false)}
          onInserted={() => {
            refresh()
            setInsertOpen(false)
          }}
        />
      )}
    </Stack>
  )
}
