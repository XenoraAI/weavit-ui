import { Group, Text, Box, Kbd, Tooltip } from '@mantine/core'
import { IconLock, IconTag } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import type { ConnectionConfig } from '@shared/types'
import { describeUser, isReadOnly } from '@shared/permissions'
import { api } from '../lib/api'
import { connColor } from '../lib/colors'
import { useCapabilities } from '../lib/useCapabilities'
import { useApp } from '../store'

function endpointLabel(cfg: ConnectionConfig): string {
  if (cfg.type === 'local') return `${cfg.localHost || 'localhost'}:${cfg.localPort || 8080}`
  if (cfg.type === 'cloud') return (cfg.clusterUrl || '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return `${cfg.httpHost || 'localhost'}:${cfg.httpPort || 8080}`
}

// A slim footer that always answers "which instance am I on, and where am I?".
// The connection's accent color anchors the left edge — the same thread that
// runs down the sidebar.
export function StatusBar() {
  const { activeConnectionId, status, selectedCollection, selectedTenant } = useApp()
  const connections = useQuery({ queryKey: ['connections'], queryFn: () => api.connections.list() })
  const st = activeConnectionId ? status[activeConnectionId] : undefined
  const active = connections.data?.find((c) => c.id === activeConnectionId)

  const meta = useQuery({
    queryKey: ['meta', activeConnectionId],
    queryFn: () => api.admin.getMeta(activeConnectionId!),
    enabled: !!activeConnectionId && st === 'connected'
  })
  const collections = useQuery({
    queryKey: ['collections', activeConnectionId],
    queryFn: () => api.schema.listCollections(activeConnectionId!),
    enabled: !!activeConnectionId && st === 'connected'
  })

  // Surfaced only when the answer is unambiguous — a resolved snapshot holding
  // no write permission at all. Anything less certain says nothing rather than
  // implying a restriction that may not exist.
  const capabilities = useCapabilities(st === 'connected' ? activeConnectionId : undefined)
  const readOnly = isReadOnly(capabilities.data)

  const color = connColor(active?.color)

  return (
    <Group h="100%" gap={0} wrap="nowrap" className="weft-mono" style={{ fontSize: 11.5 }}>
      {/* Color-anchored identity block */}
      <Group
        gap={7}
        h="100%"
        px="sm"
        wrap="nowrap"
        style={{ background: active ? `${color}22` : 'transparent', borderRight: '1px solid var(--mantine-color-dark-4)' }}
      >
        <Box w={9} h={9} style={{ borderRadius: 2, background: active ? color : 'var(--mantine-color-dark-3)' }} />
        <Text fw={600} style={{ color: active ? color : undefined }}>
          {active ? active.name : 'No connection'}
        </Text>
        {active && <Text c="dimmed">{endpointLabel(active)}</Text>}
      </Group>

      {/* Breadcrumb of where you are */}
      <Group gap={6} px="sm" wrap="nowrap" style={{ overflow: 'hidden' }}>
        {selectedCollection ? (
          <>
            <Text c="dimmed" truncate>
              {selectedCollection}
            </Text>
            {selectedTenant && (
              <Group gap={3} wrap="nowrap">
                <IconTag size={11} opacity={0.6} />
                <Text c="dimmed" truncate>
                  {selectedTenant}
                </Text>
              </Group>
            )}
          </>
        ) : (
          st === 'connected' && <Text c="dimmed">Ready</Text>
        )}
      </Group>

      <Box style={{ flex: 1 }} />

      {/* Right: cluster facts + palette hint */}
      <Group gap="md" px="sm" wrap="nowrap">
        {readOnly && (
          <Tooltip
            withArrow
            label={`Connected as ${describeUser(capabilities.data)} — this key holds no write permissions.`}
          >
            <Group gap={4} wrap="nowrap" c="yellow.6" style={{ cursor: 'default' }}>
              <IconLock size={11} />
              <Text c="yellow.6">read-only</Text>
            </Group>
          </Tooltip>
        )}
        {collections.data && <Text c="dimmed">{collections.data.length} collections</Text>}
        {meta.data?.version && <Text c="dimmed">v{meta.data.version}</Text>}
        <Group gap={4} wrap="nowrap">
          <Kbd style={{ fontSize: 10, padding: '0 4px' }}>⌘K</Kbd>
          <Text c="dimmed">search</Text>
        </Group>
      </Group>
    </Group>
  )
}
