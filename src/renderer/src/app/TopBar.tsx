import { Group, Text, Button, Badge, Box, Image } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { connColor } from '../lib/colors'
import { useApp } from '../store'
import logo from '../assets/logo.png'

const STATUS_COLOR = {
  idle: 'gray',
  connecting: 'yellow',
  connected: 'teal',
  error: 'red'
} as const

export function TopBar({ onNewConnection }: { onNewConnection: () => void }) {
  const activeId = useApp((s) => s.activeConnectionId)
  const status = useApp((s) => (activeId ? s.status[activeId] : undefined)) ?? 'idle'

  const connections = useQuery({ queryKey: ['connections'], queryFn: () => api.connections.list() })
  const active = connections.data?.find((c) => c.id === activeId)

  const meta = useQuery({
    queryKey: ['meta', activeId],
    queryFn: () => api.admin.getMeta(activeId!),
    enabled: !!activeId && status === 'connected'
  })

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <Group gap="xs" wrap="nowrap">
        <Image src={logo} w={24} h={24} radius={5} />
        <Text fw={700} size="lg" style={{ letterSpacing: 0.3 }}>
          Weavit UI
        </Text>
        <Text size="xs" c="dimmed" visibleFrom="md">
          Weaviate desktop
        </Text>
      </Group>

      <Group gap="sm" wrap="nowrap">
        {active && (
          <Group
            gap={8}
            wrap="nowrap"
            px="sm"
            py={4}
            style={{
              borderRadius: 8,
              background: `${connColor(active.color)}16`,
              border: `1px solid ${connColor(active.color)}44`
            }}
          >
            <Box
              w={9}
              h={9}
              style={{ borderRadius: 2, background: connColor(active.color) }}
            />
            <Text size="sm" fw={600}>
              {active.name}
            </Text>
            <Box
              w={7}
              h={7}
              title={status}
              style={{ borderRadius: '50%', background: `var(--mantine-color-${STATUS_COLOR[status]}-5)` }}
            />
            {meta.data?.version && (
              <Text size="xs" c="dimmed">
                v{meta.data.version}
              </Text>
            )}
          </Group>
        )}
        <Button size="xs" leftSection={<IconPlus size={15} />} variant="light" onClick={onNewConnection}>
          New connection
        </Button>
      </Group>
    </Group>
  )
}
