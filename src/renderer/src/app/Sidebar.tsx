import {
  ScrollArea,
  Stack,
  Group,
  Text,
  ActionIcon,
  UnstyledButton,
  Badge,
  Menu,
  Box,
  Tooltip,
  Loader,
  TextInput
} from '@mantine/core'
import {
  IconPlus,
  IconRefresh,
  IconDots,
  IconTrash,
  IconEdit,
  IconPlugConnected,
  IconPlugConnectedX,
  IconDatabase,
  IconSearch
} from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ConnectionWithSecretFlag } from '@shared/types'
import { api } from '../lib/api'
import { notifyErr } from '../lib/notify'
import { useConnect } from '../lib/useConnect'
import { connColor } from '../lib/colors'
import { useApp } from '../store'
import { EditCollectionModal, type EditTab } from '../features/schema/EditCollectionModal'
import { DeleteCollectionModal } from '../features/schema/DeleteCollectionModal'

interface Props {
  onNewConnection: () => void
  onEditConnection: (c: ConnectionWithSecretFlag) => void
  onNewCollection: () => void
}

const DOT: Record<string, string> = {
  idle: 'gray',
  connecting: 'yellow',
  connected: 'teal',
  error: 'red'
}

export function Sidebar({ onNewConnection, onEditConnection, onNewCollection }: Props) {
  const qc = useQueryClient()
  const { activeConnectionId, status, selectedCollection } = useApp()
  const setActiveConnection = useApp((s) => s.setActiveConnection)
  const setStatus = useApp((s) => s.setStatus)
  const selectCollection = useApp((s) => s.selectCollection)
  const connect = useConnect()
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<{ name: string; tab: EditTab } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const connections = useQuery({ queryKey: ['connections'], queryFn: () => api.connections.list() })

  // Drop cached schema/collection data for a connection so the sidebar and
  // views don't show stale collections after disconnect/delete.
  const clearCache = (id: string) => {
    qc.removeQueries({ queryKey: ['collections', id] })
    qc.removeQueries({ queryKey: ['meta', id] })
    qc.removeQueries({ queryKey: ['nodes', id] })
  }

  const disconnect = async (id: string) => {
    try {
      await api.connections.disconnect(id)
    } catch (e) {
      notifyErr(e)
    }
    setStatus(id, 'idle')
    clearCache(id)
    // Clearing the active connection hides the collections section entirely.
    if (activeConnectionId === id) setActiveConnection(undefined)
  }

  // Re-validates the connection with a live round-trip, then drops every cached
  // query for it so collections created outside the app show up.
  const refreshConnection = async (id: string) => {
    const ok = await connect(id)
    if (!ok) return
    qc.invalidateQueries({ queryKey: ['collections', id] })
    qc.invalidateQueries({ queryKey: ['collection', id] })
    qc.invalidateQueries({ queryKey: ['tenants', id] })
    qc.invalidateQueries({ queryKey: ['objects', id] })
    qc.invalidateQueries({ queryKey: ['meta', id] })
    qc.invalidateQueries({ queryKey: ['nodes', id] })
  }

  const removeConnection = async (id: string) => {
    try {
      await api.connections.remove(id)
      if (activeConnectionId === id) setActiveConnection(undefined)
      clearCache(id)
      qc.invalidateQueries({ queryKey: ['connections'] })
    } catch (e) {
      notifyErr(e)
    }
  }

  const activeStatus = activeConnectionId ? status[activeConnectionId] : undefined
  const activeColor = connColor(connections.data?.find((c) => c.id === activeConnectionId)?.color)

  const collections = useQuery({
    queryKey: ['collections', activeConnectionId],
    queryFn: () => api.schema.listCollections(activeConnectionId!),
    enabled: !!activeConnectionId && activeStatus === 'connected'
  })

  const filtered = useMemo(() => {
    const list = collections.data ?? []
    if (!filter.trim()) return list
    const q = filter.toLowerCase()
    return list.filter((c) => c.name.toLowerCase().includes(q))
  }, [collections.data, filter])

  return (
    <Stack h="100%" gap={0}>
      {/* Connections */}
      <Box p="xs">
        <Group justify="space-between" mb={6}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            Connections
          </Text>
          <Tooltip label="New connection">
            <ActionIcon size="sm" variant="subtle" onClick={onNewConnection}>
              <IconPlus size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Stack gap={2}>
          {connections.data?.length === 0 && (
            <Text size="xs" c="dimmed" py="xs">
              No connections yet. Click + to add one.
            </Text>
          )}
          {connections.data?.map((c) => {
            const st = status[c.id] ?? 'idle'
            const isActive = c.id === activeConnectionId
            const color = connColor(c.color)
            return (
              <Group key={c.id} gap={4} wrap="nowrap">
                <UnstyledButton
                  onClick={() => connect(c.id)}
                  style={{
                    flex: 1,
                    borderRadius: 8,
                    padding: '6px 8px',
                    borderLeft: `3px solid ${isActive ? color : 'transparent'}`,
                    background: isActive ? `${color}1c` : 'transparent'
                  }}
                >
                  <Group gap={8} wrap="nowrap">
                    <Box
                      w={8}
                      h={8}
                      style={{ borderRadius: '50%', background: `var(--mantine-color-${DOT[st]}-5)` }}
                    />
                    {st === 'connected' ? (
                      <IconPlugConnected size={15} style={{ color, opacity: 0.95 }} />
                    ) : (
                      <IconPlugConnectedX
                        size={15}
                        style={{ color: 'var(--mantine-color-dark-2)', opacity: 0.75 }}
                      />
                    )}
                    <div style={{ overflow: 'hidden' }}>
                      <Text size="sm" truncate>
                        {c.name}
                      </Text>
                      <Text size="10px" c="dimmed" truncate>
                        {c.type}
                      </Text>
                    </div>
                  </Group>
                </UnstyledButton>
                <Menu position="bottom-end" withArrow>
                  <Menu.Target>
                    <ActionIcon size="sm" variant="subtle" color="gray">
                      <IconDots size={15} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {st === 'connected' ? (
                      <>
                        <Menu.Item
                          leftSection={<IconRefresh size={14} />}
                          onClick={() => refreshConnection(c.id)}
                        >
                          Refresh
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconPlugConnectedX size={14} />}
                          onClick={() => disconnect(c.id)}
                        >
                          Disconnect
                        </Menu.Item>
                      </>
                    ) : (
                      <Menu.Item
                        leftSection={<IconPlugConnected size={14} />}
                        onClick={() => connect(c.id)}
                      >
                        Connect
                      </Menu.Item>
                    )}
                    <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEditConnection(c)}>
                      Edit
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => removeConnection(c.id)}
                    >
                      Delete
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            )
          })}
        </Stack>
      </Box>

      {/* Collections — only while actually connected (or connecting), so a
          dropped/errored connection never shows stale collections. */}
      {activeConnectionId && (activeStatus === 'connected' || activeStatus === 'connecting') && (
        <>
          <Box px="xs" pt="xs">
            <Group justify="space-between" mb={6}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                Collections
              </Text>
              <Group gap={2}>
                <Tooltip label="New collection">
                  <ActionIcon size="sm" variant="subtle" onClick={onNewCollection}>
                    <IconPlus size={15} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Refresh">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={() => qc.invalidateQueries({ queryKey: ['collections', activeConnectionId] })}
                  >
                    <IconRefresh size={15} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            <TextInput
              size="xs"
              placeholder="Filter collections"
              leftSection={<IconSearch size={13} />}
              value={filter}
              onChange={(e) => setFilter(e.currentTarget.value)}
              mb={6}
            />
          </Box>
          <ScrollArea style={{ flex: 1 }} px="xs">
            {activeStatus === 'connecting' && (
              <Group gap="xs" py="sm">
                <Loader size="xs" />
                <Text size="xs" c="dimmed">
                  Connecting…
                </Text>
              </Group>
            )}
            {collections.isLoading && activeStatus === 'connected' && <Loader size="xs" my="sm" />}
            <Stack gap={2} pb="md">
              {filtered.map((c) => {
                const isSel = c.name === selectedCollection
                return (
                  <Group key={c.name} gap={2} wrap="nowrap">
                    <UnstyledButton
                      onClick={() => selectCollection(c.name)}
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        borderRadius: 8,
                        padding: '6px 8px',
                        borderLeft: `3px solid ${isSel ? activeColor : 'transparent'}`,
                        background: isSel ? `${activeColor}18` : 'transparent'
                      }}
                    >
                      <Group gap={8} wrap="nowrap" justify="space-between">
                        <Group gap={8} wrap="nowrap" style={{ overflow: 'hidden' }}>
                          <IconDatabase size={15} style={{ color: isSel ? activeColor : undefined, opacity: 0.85 }} />
                          <Text size="sm" truncate>
                            {c.name}
                          </Text>
                        </Group>
                        {c.multiTenancyEnabled && (
                          <Badge size="xs" variant="light" color="grape">
                            MT
                          </Badge>
                        )}
                      </Group>
                    </UnstyledButton>
                    <Menu position="bottom-end" withArrow>
                      <Menu.Target>
                        <ActionIcon size="sm" variant="subtle" color="gray">
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconEdit size={14} />}
                          onClick={() => setEditing({ name: c.name, tab: 'settings' })}
                        >
                          Edit
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconPlus size={14} />}
                          onClick={() => setEditing({ name: c.name, tab: 'property' })}
                        >
                          Add property
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => setDeleting(c.name)}
                        >
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                )
              })}
              {activeStatus === 'connected' && filtered.length === 0 && !collections.isLoading && (
                <Text size="xs" c="dimmed" py="xs">
                  No collections.
                </Text>
              )}
            </Stack>
          </ScrollArea>
        </>
      )}

      {activeConnectionId && editing && (
        <EditCollectionModal
          opened
          connectionId={activeConnectionId}
          collection={editing.name}
          initialTab={editing.tab}
          onClose={() => setEditing(null)}
        />
      )}
      {activeConnectionId && deleting && (
        <DeleteCollectionModal
          opened
          connectionId={activeConnectionId}
          collection={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </Stack>
  )
}
