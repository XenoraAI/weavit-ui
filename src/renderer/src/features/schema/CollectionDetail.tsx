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
  Modal,
  Alert,
  Code,
  TextInput,
  Divider,
  Tabs
} from '@mantine/core'
import { IconTrash, IconAlertTriangle } from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { useApp } from '../../store'
import { JsonView } from '../../components/JsonView'

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

export function CollectionDetail({ connectionId, collection }: Props) {
  const qc = useQueryClient()
  const selectCollection = useApp((s) => s.selectCollection)
  const [confirm, setConfirm] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState(false)

  const config = useQuery({
    queryKey: ['collection', connectionId, collection],
    queryFn: () => api.schema.getCollection(connectionId, collection)
  })

  const doDelete = async () => {
    setBusy(true)
    try {
      await api.schema.deleteCollection(connectionId, collection)
      notifyOk(`Deleted collection ${collection}`)
      qc.invalidateQueries({ queryKey: ['collections', connectionId] })
      selectCollection(undefined)
    } catch (e) {
      notifyErr(e, 'Delete failed')
    } finally {
      setBusy(false)
      setConfirm(false)
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
            <Tabs.Tab value="raw">Raw config</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="properties">
            <Table withTableBorder striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Data type</Table.Th>
                  <Table.Th>Tokenization</Table.Th>
                  <Table.Th>Filterable</Table.Th>
                  <Table.Th>Searchable</Table.Th>
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
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>

          <Tabs.Panel value="raw">
            <JsonView value={c.raw} maxHeight={480} />
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

      <Modal opened={confirm} onClose={() => setConfirm(false)} title="Delete collection" centered>
        <Alert color="red" icon={<IconAlertTriangle />} mb="md">
          This permanently deletes <Code>{collection}</Code> and every object in it.
        </Alert>
        <TextInput
          label={`Type "${collection}" to confirm`}
          value={confirmName}
          onChange={(e) => setConfirmName(e.currentTarget.value)}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button color="red" disabled={confirmName !== collection} loading={busy} onClick={doDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
    </Box>
  )
}
