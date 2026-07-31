import { Box, Stack, Group, Text, Card, SimpleGrid, Badge, Loader, Tabs, Paper, Title } from '@mantine/core'
import { IconServer2, IconBox, IconTerminal2 } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { JsonView } from '../../components/JsonView'
import { RawConsole } from './RawConsole'

export function ConnectionOverview({ connectionId }: { connectionId: string }) {
  const meta = useQuery({ queryKey: ['meta', connectionId], queryFn: () => api.admin.getMeta(connectionId) })
  const nodes = useQuery({ queryKey: ['nodes', connectionId], queryFn: () => api.admin.getNodes(connectionId) })
  const collections = useQuery({
    queryKey: ['collections', connectionId],
    queryFn: () => api.schema.listCollections(connectionId)
  })

  const moduleNames = meta.data?.modules ? Object.keys(meta.data.modules) : []

  return (
    <Box style={{ height: '100%', overflow: 'auto' }} p="md">
      <Stack>
        <Title order={4}>Cluster overview</Title>

        <SimpleGrid cols={{ base: 2, md: 4 }}>
          <Card withBorder padding="sm">
            <Text size="xs" c="dimmed" tt="uppercase">
              Version
            </Text>
            <Group gap={6}>
              <IconServer2 size={16} />
              <Text fw={600}>{meta.data?.version ?? (meta.isLoading ? '…' : '—')}</Text>
            </Group>
          </Card>
          <Card withBorder padding="sm">
            <Text size="xs" c="dimmed" tt="uppercase">
              Collections
            </Text>
            <Group gap={6}>
              <IconBox size={16} />
              <Text fw={600}>{collections.data?.length ?? (collections.isLoading ? '…' : 0)}</Text>
            </Group>
          </Card>
          <Card withBorder padding="sm">
            <Text size="xs" c="dimmed" tt="uppercase">
              Nodes
            </Text>
            <Text fw={600}>{nodes.data?.nodes.length ?? (nodes.isLoading ? '…' : '—')}</Text>
          </Card>
          <Card withBorder padding="sm">
            <Text size="xs" c="dimmed" tt="uppercase">
              Modules
            </Text>
            <Text fw={600}>{moduleNames.length}</Text>
          </Card>
        </SimpleGrid>

        {moduleNames.length > 0 && (
          <Group gap={6}>
            {moduleNames.map((m) => (
              <Badge key={m} variant="light" color="aqua">
                {m}
              </Badge>
            ))}
          </Group>
        )}

        <Text c="dimmed" size="sm">
          Select a collection in the sidebar to browse data, view its schema, or run searches.
        </Text>

        <Tabs defaultValue="console">
          <Tabs.List mb="sm">
            <Tabs.Tab value="console" leftSection={<IconTerminal2 size={15} />}>
              Console
            </Tabs.Tab>
            <Tabs.Tab value="nodes">Nodes</Tabs.Tab>
            <Tabs.Tab value="meta">Meta</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="console">
            <Paper withBorder p="md">
              <RawConsole connectionId={connectionId} />
            </Paper>
          </Tabs.Panel>
          <Tabs.Panel value="nodes">
            {nodes.isLoading ? <Loader /> : <JsonView value={nodes.data?.nodes ?? []} maxHeight={480} />}
          </Tabs.Panel>
          <Tabs.Panel value="meta">
            {meta.isLoading ? <Loader /> : <JsonView value={meta.data ?? {}} maxHeight={480} />}
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Box>
  )
}
