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
  Badge,
  Menu,
  MultiSelect,
  UnstyledButton
} from '@mantine/core'
import {
  IconPlus,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconAlertTriangle,
  IconDownload,
  IconUpload,
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SortSpec, WeaviateObject } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { downloadText, toCsv, toJsonl } from '../../lib/exportFile'
import { ObjectDrawer } from './ObjectDrawer'
import { InsertModal } from './InsertModal'
import { ImportModal } from './ImportModal'

interface Props {
  connectionId: string
  collection: string
  tenant?: string
  mtEnabled: boolean
}

const PAGE_SIZES = ['10', '25', '50', '100']
const EXPORT_CAP = 10000

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
  const [vectorNames, setVectorNames] = useState<string[]>([])
  const [refProperties, setRefProperties] = useState<string[]>([])
  const [sort, setSort] = useState<SortSpec[]>([])
  const [selected, setSelected] = useState<WeaviateObject | null>(null)
  const [insertOpen, setInsertOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const offset = page * limit
  const needsTenant = mtEnabled && !tenant

  // Shares its cache entry with the collection header, so this costs nothing.
  const config = useQuery({
    queryKey: ['collection', connectionId, collection],
    queryFn: () => api.schema.getCollection(connectionId, collection)
  })
  const references = config.data?.references ?? []
  // The implicit 'default' space isn't selectable — there is nothing to choose.
  const namedVectors = (config.data?.namedVectors ?? [])
    .map((v) => v.name)
    .filter((n) => n !== 'default')

  // Weaviate resolves a cross-reference only when asked for it by name.
  const returnReferences = refProperties.length
    ? refProperties.map((property) => ({ property }))
    : undefined

  const objectsKey = [
    'objects',
    connectionId,
    collection,
    tenant,
    limit,
    offset,
    includeVector,
    vectorNames,
    refProperties,
    sort
  ]
  const objects = useQuery({
    queryKey: objectsKey,
    queryFn: () =>
      api.data.fetchObjects({
        connectionId,
        collection,
        tenant,
        limit,
        offset,
        includeVector,
        vectorNames: vectorNames.length ? vectorNames : undefined,
        returnReferences,
        sort: sort.length ? sort : undefined
      }),
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

  /** Click a header to cycle: unsorted → ascending → descending → unsorted. */
  const cycleSort = (property: string) => {
    setPage(0)
    setSort((current) => {
      const existing = current.find((s) => s.property === property)
      if (!existing) return [{ property, direction: 'asc' }]
      if (existing.direction === 'asc') return [{ property, direction: 'desc' }]
      return []
    })
  }

  const sortIcon = (property: string) => {
    const s = sort.find((x) => x.property === property)
    if (!s) return <IconArrowsSort size={12} style={{ opacity: 0.35 }} />
    return s.direction === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />
  }

  const exportAll = async (format: 'csv' | 'jsonl') => {
    setExporting(true)
    try {
      const rows = await api.data.exportObjects({
        connectionId,
        collection,
        tenant,
        includeVector,
        vectorNames: vectorNames.length ? vectorNames : undefined,
        returnReferences,
        limit: EXPORT_CAP
      })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      if (format === 'csv') {
        downloadText(`${collection}-${stamp}.csv`, toCsv(rows, includeVector), 'text/csv')
      } else {
        downloadText(`${collection}-${stamp}.jsonl`, toJsonl(rows), 'application/x-ndjson')
      }
      notifyOk(
        rows.length >= EXPORT_CAP
          ? `Exported the first ${EXPORT_CAP} objects (export cap)`
          : `Exported ${rows.length} objects`
      )
    } catch (e) {
      notifyErr(e, 'Export failed')
    } finally {
      setExporting(false)
    }
  }

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
          <Button
            size="xs"
            variant="light"
            leftSection={<IconUpload size={15} />}
            onClick={() => setImportOpen(true)}
          >
            Import
          </Button>
          <Menu position="bottom-start" withArrow>
            <Menu.Target>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconDownload size={15} />}
                loading={exporting}
              >
                Export
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Up to {EXPORT_CAP.toLocaleString()} objects</Menu.Label>
              <Menu.Item onClick={() => exportAll('csv')}>Download CSV</Menu.Item>
              <Menu.Item onClick={() => exportAll('jsonl')}>Download JSONL</Menu.Item>
            </Menu.Dropdown>
          </Menu>
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
          {includeVector && namedVectors.length > 1 && (
            <MultiSelect
              size="xs"
              w={200}
              placeholder={vectorNames.length ? undefined : 'all vectors'}
              title="Fetch only these named vectors"
              data={namedVectors}
              value={vectorNames}
              onChange={setVectorNames}
              clearable
            />
          )}
          {references.length > 0 && (
            <MultiSelect
              size="xs"
              w={220}
              placeholder={refProperties.length ? undefined : 'resolve references…'}
              title="Cross-references to resolve into each object, here and in exports"
              data={references.map((r) => r.name)}
              value={refProperties}
              onChange={(v) => {
                setPage(0)
                setRefProperties(v)
              }}
              clearable
            />
          )}
        </Group>

        <Group gap="xs" wrap="nowrap">
          {total !== undefined && (
            <Badge variant="light" color="gray">
              {total} objects
            </Badge>
          )}
          {objects.data?.totalCountError && (
            <Tooltip label={objects.data.totalCountError} multiline w={280}>
              <Badge variant="light" color="yellow">
                count unavailable
              </Badge>
            </Tooltip>
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
                    <UnstyledButton onClick={() => cycleSort(c)} style={{ fontSize: 'inherit' }}>
                      <Group gap={4} wrap="nowrap">
                        <span>{c}</span>
                        {sortIcon(c)}
                      </Group>
                    </UnstyledButton>
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

      {importOpen && (
        <ImportModal
          connectionId={connectionId}
          collection={collection}
          tenant={tenant}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            refresh()
            setImportOpen(false)
          }}
        />
      )}
    </Stack>
  )
}
