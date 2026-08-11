import { useState, type ReactNode } from 'react'
import {
  Box,
  Stack,
  Group,
  Text,
  Table,
  Badge,
  Button,
  Card,
  SimpleGrid,
  Loader,
  Center,
  Alert,
  Code,
  Divider,
  Tabs,
  Menu,
  ActionIcon,
  Tooltip,
  Modal
} from '@mantine/core'
import {
  IconTrash,
  IconAlertTriangle,
  IconEdit,
  IconPlus,
  IconDots,
  IconDownload,
  IconRefresh,
  IconLock,
  IconLockOpen
} from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InvertedIndexName } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { downloadText } from '../../lib/exportFile'
import { JsonView } from '../../components/JsonView'
import { EditCollectionModal, type EditTab } from './EditCollectionModal'
import { DeleteCollectionModal } from './DeleteCollectionModal'

interface Props {
  connectionId: string
  collection: string
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card padding="sm" withBorder>
      <Text size="xs" c="dimmed" tt="uppercase">
        {label}
      </Text>
      <Text fw={600}>{value}</Text>
    </Card>
  )
}

const SHARD_COLOR: Record<string, string> = { READY: 'teal', READONLY: 'orange' }

export function CollectionDetail({ connectionId, collection }: Props) {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [editTab, setEditTab] = useState<EditTab | null>(null)
  const [dropping, setDropping] = useState<{ property: string; index: InvertedIndexName } | null>(
    null
  )

  const config = useQuery({
    queryKey: ['collection', connectionId, collection],
    queryFn: () => api.schema.getCollection(connectionId, collection)
  })

  const shards = useQuery({
    queryKey: ['shards', connectionId, collection],
    queryFn: () => api.schema.getShards(connectionId, collection),
    retry: false
  })

  const dropIndex = useMutation({
    mutationFn: () =>
      api.schema.dropInvertedIndex(connectionId, collection, dropping!.property, dropping!.index),
    onSuccess: () => {
      notifyOk(`Dropped the ${dropping!.index} index on ${dropping!.property}`)
      setDropping(null)
      qc.invalidateQueries({ queryKey: ['collection', connectionId, collection] })
    },
    onError: (e) => notifyErr(e, 'Could not drop index')
  })

  const setShardStatus = useMutation({
    mutationFn: (v: { name: string; status: 'READY' | 'READONLY' }) =>
      api.schema.updateShards(connectionId, collection, v.status, [v.name]),
    onSuccess: (_r, v) => {
      notifyOk(`Shard ${v.name} set to ${v.status}`)
      qc.invalidateQueries({ queryKey: ['shards', connectionId, collection] })
    },
    onError: (e) => notifyErr(e, 'Could not change shard status')
  })

  const exportSchema = async () => {
    try {
      const schema = await api.schema.exportSchema(connectionId, collection)
      downloadText(`${collection}-schema.json`, JSON.stringify(schema, null, 2), 'application/json')
      notifyOk('Schema exported')
    } catch (e) {
      notifyErr(e, 'Export failed')
    }
  }

  if (config.isLoading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    )
  }
  if (config.isError) {
    return (
      <Box p="md">
        <Alert color="red" icon={<IconAlertTriangle />} title="Failed to load schema">
          {(config.error as Error).message}
        </Alert>
      </Box>
    )
  }
  if (!config.data) return null
  const c = config.data

  return (
    <Box style={{ height: '100%', overflow: 'auto' }} p="md">
      <Stack>
        <Group justify="flex-end" gap="xs">
          <Button
            variant="light"
            leftSection={<IconDownload size={15} />}
            onClick={exportSchema}
          >
            Export schema
          </Button>
          <Button
            variant="light"
            leftSection={<IconEdit size={15} />}
            onClick={() => setEditTab('settings')}
          >
            Edit collection
          </Button>
        </Group>

        <SimpleGrid cols={{ base: 2, md: 4 }}>
          <Stat label="Properties" value={c.properties.length} />
          <Stat label="Vectorizer" value={c.vectorizer ?? 'none'} />
          <Stat label="Vector index" value={c.vectorIndexType ?? '—'} />
          <Stat
            label="Multi-tenancy"
            value={c.multiTenancy.enabled ? <Badge color="grape">enabled</Badge> : 'off'}
          />
        </SimpleGrid>

        <Tabs defaultValue="properties">
          <Tabs.List mb="sm">
            <Tabs.Tab value="properties">Properties</Tabs.Tab>
            <Tabs.Tab value="references">References</Tabs.Tab>
            <Tabs.Tab value="vectors">Vectors</Tabs.Tab>
            <Tabs.Tab value="shards">Shards</Tabs.Tab>
            <Tabs.Tab value="raw">Raw config</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="properties">
            <Group justify="flex-end" mb="xs">
              <Button
                size="compact-sm"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => setEditTab('property')}
              >
                Add property
              </Button>
            </Group>
            <Table withTableBorder striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Data type</Table.Th>
                  <Table.Th>Tokenization</Table.Th>
                  <Table.Th>Filterable</Table.Th>
                  <Table.Th>Searchable</Table.Th>
                  <Table.Th>Range</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {c.properties.map((p) => (
                  <Table.Tr key={p.name}>
                    <Table.Td>
                      <Text fw={600} size="sm">
                        {p.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Code>{(Array.isArray(p.dataType) ? p.dataType : [p.dataType]).join(', ')}</Code>
                    </Table.Td>
                    <Table.Td>{p.tokenization ?? '—'}</Table.Td>
                    <Table.Td>{p.indexFilterable ? '✓' : '—'}</Table.Td>
                    <Table.Td>{p.indexSearchable ? '✓' : '—'}</Table.Td>
                    <Table.Td>{p.indexRangeFilters ? '✓' : '—'}</Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withArrow>
                        <Menu.Target>
                          <ActionIcon size="sm" variant="subtle" color="gray">
                            <IconDots size={14} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Label>Drop inverted index</Menu.Label>
                          <Menu.Item
                            disabled={!p.indexFilterable}
                            onClick={() => setDropping({ property: p.name, index: 'filterable' })}
                          >
                            filterable
                          </Menu.Item>
                          <Menu.Item
                            disabled={!p.indexSearchable}
                            onClick={() => setDropping({ property: p.name, index: 'searchable' })}
                          >
                            searchable
                          </Menu.Item>
                          <Menu.Item
                            disabled={!p.indexRangeFilters}
                            onClick={() => setDropping({ property: p.name, index: 'rangeFilters' })}
                          >
                            rangeFilters
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>

          <Tabs.Panel value="references">
            <Group justify="flex-end" mb="xs">
              <Button
                size="compact-sm"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => setEditTab('reference')}
              >
                Add reference
              </Button>
            </Group>
            {c.references.length === 0 ? (
              <Text c="dimmed" size="sm">
                No cross-references. A reference property links objects here to objects in another
                collection, and can be resolved alongside a query.
              </Text>
            ) : (
              <Table withTableBorder striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Targets</Table.Th>
                    <Table.Th>Description</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {c.references.map((r) => (
                    <Table.Tr key={r.name}>
                      <Table.Td>
                        <Text fw={600} size="sm">
                          {r.name}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {r.targetCollections.map((t) => (
                            <Badge key={t} size="sm" variant="light">
                              {t}
                            </Badge>
                          ))}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {r.description ?? '—'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="vectors">
            <Group justify="flex-end" mb="xs">
              <Button
                size="compact-sm"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => setEditTab('vector')}
              >
                Add named vector
              </Button>
            </Group>
            <Table withTableBorder striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Vectorizer</Table.Th>
                  <Table.Th>Index</Table.Th>
                  <Table.Th>Quantization</Table.Th>
                  <Table.Th>Source properties</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {c.namedVectors.map((v) => (
                  <Table.Tr key={v.name}>
                    <Table.Td>
                      <Badge variant="light" color="aqua">
                        {v.name}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{v.vectorizer ?? 'none'}</Table.Td>
                    <Table.Td>
                      <Code>{v.indexType ?? '—'}</Code>
                    </Table.Td>
                    <Table.Td>
                      {v.quantizer ? (
                        <Badge size="sm" variant="light" color="violet">
                          {v.quantizer.type}
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">
                          none
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {v.sourceProperties?.join(', ') || 'all'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>

          <Tabs.Panel value="shards">
            <Group justify="space-between" mb="xs">
              <Text size="xs" c="dimmed">
                Weaviate drops a shard to READONLY by itself when a node runs low on disk. Setting it
                back to READY is what re-enables writes once space has been freed.
              </Text>
              <Tooltip label="Refresh">
                <ActionIcon
                  variant="light"
                  onClick={() => qc.invalidateQueries({ queryKey: ['shards', connectionId, collection] })}
                >
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {shards.isError ? (
              <Alert color="red" icon={<IconAlertTriangle />}>
                {(shards.error as Error).message}
              </Alert>
            ) : (
              <Table withTableBorder striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Shard</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Vector queue</Table.Th>
                    <Table.Th w={120} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(shards.data ?? []).map((s) => (
                    <Table.Tr key={s.name}>
                      <Table.Td>
                        <Code>{s.name}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={SHARD_COLOR[s.status] ?? 'gray'}>
                          {s.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{s.vectorQueueSize ?? 0}</Table.Td>
                      <Table.Td>
                        <Group justify="flex-end">
                          {s.status === 'READONLY' ? (
                            <Button
                              size="compact-xs"
                              variant="light"
                              color="teal"
                              leftSection={<IconLockOpen size={13} />}
                              onClick={() => setShardStatus.mutate({ name: s.name, status: 'READY' })}
                            >
                              Set READY
                            </Button>
                          ) : (
                            <Button
                              size="compact-xs"
                              variant="light"
                              color="orange"
                              leftSection={<IconLock size={13} />}
                              onClick={() =>
                                setShardStatus.mutate({ name: s.name, status: 'READONLY' })
                              }
                            >
                              Set READONLY
                            </Button>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="raw">
            <JsonView value={c.raw} maxHeight={480} />
            <Group justify="flex-end" mt="xs">
              <Button
                size="compact-xs"
                variant="light"
                leftSection={<IconDownload size={13} />}
                onClick={() =>
                  downloadText(
                    `${collection}-config.json`,
                    JSON.stringify(c.raw, null, 2),
                    'application/json'
                  )
                }
              >
                Download JSON
              </Button>
            </Group>
          </Tabs.Panel>
        </Tabs>

        <Divider my="sm" />
        <Group justify="space-between">
          <div>
            <Text fw={600}>Danger zone</Text>
            <Text size="xs" c="dimmed">
              Deleting a collection removes all of its objects permanently.
            </Text>
          </div>
          <Button color="red" variant="light" leftSection={<IconTrash size={15} />} onClick={() => setConfirm(true)}>
            Delete collection
          </Button>
        </Group>
      </Stack>

      <DeleteCollectionModal
        opened={confirm}
        connectionId={connectionId}
        collection={collection}
        onClose={() => setConfirm(false)}
      />
      {editTab && (
        <EditCollectionModal
          opened
          connectionId={connectionId}
          collection={collection}
          initialTab={editTab}
          onClose={() => setEditTab(null)}
        />
      )}

      <Modal
        opened={dropping !== null}
        onClose={() => setDropping(null)}
        title="Drop inverted index"
        centered
      >
        <Stack gap="sm">
          <Alert color="red" icon={<IconAlertTriangle />}>
            This removes the <Code>{dropping?.index}</Code> index on{' '}
            <Code>{dropping?.property}</Code>. Filters and keyword searches that rely on it stop
            working, and rebuilding it means recreating the collection.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDropping(null)}>
              Cancel
            </Button>
            <Button color="red" loading={dropIndex.isPending} onClick={() => dropIndex.mutate()}>
              Drop index
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  )
}
