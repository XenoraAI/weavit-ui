import { useState } from 'react'
import {
  Drawer,
  Tabs,
  Stack,
  Group,
  Text,
  Badge,
  ActionIcon,
  Button,
  UnstyledButton,
  TextInput,
  Center,
  Loader
} from '@mantine/core'
import { IconTrash, IconHistory, IconBookmark, IconDeviceFloppy } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SearchRequest } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'

interface Props {
  connectionId: string
  collection: string
  /** The query currently in the panel, offered for saving. */
  current: SearchRequest
  onLoad: (req: SearchRequest) => void
  onClose: () => void
}

/** A one-line summary of what a stored query actually does. */
function describe(req: SearchRequest): string {
  const term =
    req.queryText ||
    req.queryObjectId ||
    (req.queryVector ? 'vector' : '') ||
    (req.queryMedia ? 'media' : '')
  const filters = req.filters.length ? ` · ${req.filters.length} filter(s)` : ''
  return `${req.type}${term ? `: ${term}` : ''}${filters}`
}

export function HistoryDrawer({ connectionId, collection, current, onLoad, onClose }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')

  const history = useQuery({
    queryKey: ['history', connectionId, collection],
    queryFn: () => api.history.list(connectionId, collection)
  })
  const saved = useQuery({ queryKey: ['savedQueries'], queryFn: () => api.history.listSaved() })

  const save = useMutation({
    mutationFn: () =>
      api.history.save({ name: name.trim(), connectionId, collection, request: current }),
    onSuccess: () => {
      notifyOk('Query saved')
      setName('')
      qc.invalidateQueries({ queryKey: ['savedQueries'] })
    },
    onError: (e) => notifyErr(e, 'Could not save query')
  })

  const removeSaved = useMutation({
    mutationFn: (id: string) => api.history.deleteSaved(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savedQueries'] }),
    onError: (e) => notifyErr(e)
  })

  const clear = useMutation({
    mutationFn: () => api.history.clear(connectionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['history', connectionId] }),
    onError: (e) => notifyErr(e)
  })

  const load = (req: SearchRequest) => {
    onLoad(req)
    onClose()
  }

  const savedForCollection = (saved.data ?? []).filter((q) => q.collection === collection)

  return (
    <Drawer opened onClose={onClose} position="right" size="md" title="Queries">
      <Tabs defaultValue="history">
        <Tabs.List mb="sm">
          <Tabs.Tab value="history" leftSection={<IconHistory size={15} />}>
            Recent
          </Tabs.Tab>
          <Tabs.Tab value="saved" leftSection={<IconBookmark size={15} />}>
            Saved
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="history">
          <Stack gap="xs">
            {history.isLoading && (
              <Center h={80}>
                <Loader size="sm" />
              </Center>
            )}
            {history.data?.length === 0 && (
              <Text c="dimmed" size="sm">
                No queries run against this collection yet.
              </Text>
            )}
            {history.data?.map((h) => (
              <UnstyledButton
                key={h.id}
                onClick={() => load(h.request)}
                style={{ borderRadius: 8, padding: '8px 10px', background: 'var(--mantine-color-dark-6)' }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ overflow: 'hidden' }}>
                    <Text size="sm" truncate>
                      {describe(h.request)}
                    </Text>
                    <Text size="10px" c="dimmed">
                      {new Date(h.at).toLocaleString()}
                    </Text>
                  </div>
                  {h.resultCount != null && (
                    <Badge size="xs" variant="light">
                      {h.resultCount}
                    </Badge>
                  )}
                </Group>
              </UnstyledButton>
            ))}
            {(history.data?.length ?? 0) > 0 && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={13} />}
                loading={clear.isPending}
                onClick={() => clear.mutate()}
              >
                Clear history
              </Button>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="saved">
          <Stack gap="xs">
            <Group gap="xs" align="end">
              <TextInput
                size="xs"
                label="Save current query as"
                placeholder="e.g. top rated in stock"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                size="xs"
                leftSection={<IconDeviceFloppy size={14} />}
                disabled={!name.trim()}
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                Save
              </Button>
            </Group>

            {savedForCollection.length === 0 && (
              <Text c="dimmed" size="sm">
                Nothing saved for this collection.
              </Text>
            )}
            {savedForCollection.map((q) => (
              <Group key={q.id} gap="xs" wrap="nowrap">
                <UnstyledButton
                  onClick={() => load(q.request)}
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    borderRadius: 8,
                    padding: '8px 10px',
                    background: 'var(--mantine-color-dark-6)'
                  }}
                >
                  <Text size="sm" truncate>
                    {q.name}
                  </Text>
                  <Text size="10px" c="dimmed" truncate>
                    {describe(q.request)}
                  </Text>
                </UnstyledButton>
                <ActionIcon color="red" variant="subtle" onClick={() => removeSaved.mutate(q.id)}>
                  <IconTrash size={15} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Drawer>
  )
}
