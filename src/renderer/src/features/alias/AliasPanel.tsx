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
  TextInput,
  Select,
  ActionIcon,
  Center,
  Loader,
  Alert,
  Tooltip,
  Code
} from '@mantine/core'
import {
  IconPlus,
  IconTrash,
  IconRefresh,
  IconAlertTriangle,
  IconArrowsExchange
} from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'

interface Props {
  connectionId: string
}

/**
 * Aliases are stable names pointing at a collection. The workflow they exist
 * for is a rebuild: index into Products_v2 alongside the live Products, then
 * repoint the alias so every reader switches over at once.
 */
export function AliasPanel({ connectionId }: Props) {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [repointing, setRepointing] = useState<{ alias: string; collection: string } | null>(null)
  const [newAlias, setNewAlias] = useState('')
  const [newTarget, setNewTarget] = useState<string | null>(null)

  const aliases = useQuery({
    queryKey: ['aliases', connectionId],
    queryFn: () => api.alias.list(connectionId)
  })
  const collections = useQuery({
    queryKey: ['collections', connectionId],
    queryFn: () => api.schema.listCollections(connectionId)
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['aliases', connectionId] })

  const create = useMutation({
    mutationFn: () => api.alias.create(connectionId, newAlias.trim(), newTarget ?? ''),
    onSuccess: () => {
      notifyOk(`Alias ${newAlias} created`)
      setCreating(false)
      setNewAlias('')
      setNewTarget(null)
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not create alias')
  })

  const repoint = useMutation({
    mutationFn: (target: string) => api.alias.update(connectionId, repointing!.alias, target),
    onSuccess: () => {
      notifyOk('Alias repointed')
      setRepointing(null)
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not repoint alias')
  })

  const remove = useMutation({
    mutationFn: (alias: string) => api.alias.delete(connectionId, alias),
    onSuccess: () => {
      notifyOk('Alias deleted')
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not delete alias')
  })

  const collectionNames = (collections.data ?? []).map((c) => c.name)

  return (
    <Box p="md" style={{ height: '100%', overflow: 'auto' }}>
      <Group justify="space-between" mb="md">
        <div>
          <Text fw={700} size="lg">
            Aliases
          </Text>
          <Text size="sm" c="dimmed">
            A stable name that points at a collection. Repoint it to swap in a rebuilt collection
            without changing any query code.
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip label="Refresh">
            <ActionIcon variant="light" onClick={invalidate}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Button size="xs" leftSection={<IconPlus size={15} />} onClick={() => setCreating(true)}>
            New alias
          </Button>
        </Group>
      </Group>

      {aliases.isLoading && (
        <Center h={160}>
          <Loader />
        </Center>
      )}
      {aliases.isError && (
        <Alert color="red" icon={<IconAlertTriangle />} title="Could not load aliases">
          {(aliases.error as Error).message}
          <Text size="xs" mt="xs">
            Aliases need Weaviate 1.32 or newer.
          </Text>
        </Alert>
      )}
      {aliases.data?.length === 0 && (
        <Text c="dimmed">No aliases defined on this instance.</Text>
      )}

      {(aliases.data?.length ?? 0) > 0 && (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Alias</Table.Th>
              <Table.Th>Points at</Table.Th>
              <Table.Th w={140} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {aliases.data?.map((a) => (
              <Table.Tr key={a.alias}>
                <Table.Td>
                  <Badge variant="light" color="aqua">
                    {a.alias}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Code>{a.collection}</Code>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end">
                    <Tooltip label="Repoint">
                      <ActionIcon
                        variant="subtle"
                        onClick={() => setRepointing({ alias: a.alias, collection: a.collection })}
                      >
                        <IconArrowsExchange size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => remove.mutate(a.alias)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={creating} onClose={() => setCreating(false)} title="New alias" centered>
        <Stack gap="sm">
          <TextInput
            label="Alias name"
            placeholder="Products"
            description="Must not collide with an existing collection name"
            value={newAlias}
            onChange={(e) => setNewAlias(e.currentTarget.value)}
          />
          <Select
            label="Target collection"
            placeholder="Pick a collection"
            searchable
            data={collectionNames}
            value={newTarget}
            onChange={setNewTarget}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newAlias.trim() || !newTarget}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={repointing !== null}
        onClose={() => setRepointing(null)}
        title={`Repoint ${repointing?.alias ?? ''}`}
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Currently points at <Code>{repointing?.collection}</Code>. Repointing takes effect
            immediately for every client using this alias.
          </Text>
          <Select
            label="New target collection"
            searchable
            data={collectionNames}
            value={repointing?.collection ?? null}
            onChange={(v) => v && setRepointing({ ...repointing!, collection: v })}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRepointing(null)}>
              Cancel
            </Button>
            <Button
              loading={repoint.isPending}
              onClick={() => repointing && repoint.mutate(repointing.collection)}
            >
              Repoint
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  )
}
