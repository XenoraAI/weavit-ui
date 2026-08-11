import { useState } from 'react'
import {
  Box,
  Stack,
  Group,
  Text,
  Card,
  SimpleGrid,
  Badge,
  Loader,
  Tabs,
  Paper,
  Title,
  Button,
  Alert
} from '@mantine/core'
import {
  IconServer2,
  IconBox,
  IconTerminal2,
  IconHeartbeat,
  IconDownload,
  IconUpload,
  IconWand,
  IconAlertTriangle
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { downloadText, pickTextFile } from '../../lib/exportFile'
import { InspectPanel } from '../../components/InspectPanel'
import { NodeCards } from '../cluster/NodeCards'
import { RawConsole } from './RawConsole'
import { TokenizerPreview } from './TokenizerPreview'
import { MetaView } from './MetaView'

/** How many module badges the header shows before collapsing the rest. */
const MODULE_PREVIEW = 8

export function ConnectionOverview({ connectionId }: { connectionId: string }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<string | null>('console')

  const meta = useQuery({ queryKey: ['meta', connectionId], queryFn: () => api.admin.getMeta(connectionId) })
  // The raw /v1/nodes payload backs the JSON view, so what you download is
  // exactly what the server said. The typed call backs the visual.
  const nodes = useQuery({ queryKey: ['nodes', connectionId], queryFn: () => api.admin.getNodes(connectionId) })
  const clusterNodes = useQuery({
    queryKey: ['clusterNodes', connectionId],
    queryFn: () => api.cluster.nodes(connectionId)
  })
  const health = useQuery({
    queryKey: ['health', connectionId],
    queryFn: () => api.admin.health(connectionId),
    // Cheap probes, so keep them reasonably fresh while the view is open.
    refetchInterval: 15000
  })
  const collections = useQuery({
    queryKey: ['collections', connectionId],
    queryFn: () => api.schema.listCollections(connectionId)
  })
  const me = useQuery({
    queryKey: ['myUser', connectionId],
    queryFn: () => api.rbac.getMyUser(connectionId),
    // Anonymous instances have no current user; that's not an error worth showing.
    retry: false
  })

  const moduleNames = meta.data?.modules ? Object.keys(meta.data.modules) : []

  const exportSchema = async () => {
    setBusy(true)
    try {
      const schema = await api.schema.exportSchema(connectionId)
      downloadText('weaviate-schema.json', JSON.stringify(schema, null, 2), 'application/json')
      notifyOk('Schema exported')
    } catch (e) {
      notifyErr(e, 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  const importSchema = async () => {
    const file = await pickTextFile('.json,application/json')
    if (!file) return
    setBusy(true)
    try {
      const parsed = JSON.parse(file.text)
      const { created } = await api.schema.importSchema(connectionId, parsed)
      notifyOk(
        created.length === 0
          ? 'Nothing created — every collection already exists'
          : `Created ${created.length}: ${created.join(', ')}`
      )
      qc.invalidateQueries({ queryKey: ['collections', connectionId] })
    } catch (e) {
      notifyErr(e, 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const healthLabel = health.data
    ? health.data.live && health.data.ready
      ? 'ready'
      : health.data.live
        ? 'live, not ready'
        : 'unreachable'
    : health.isLoading
      ? '…'
      : '—'

  return (
    <Box style={{ height: '100%', overflow: 'auto' }} p="md">
      <Stack>
        <Group justify="space-between">
          <Title order={4}>Cluster overview</Title>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconDownload size={14} />}
              loading={busy}
              onClick={exportSchema}
            >
              Export schema
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconUpload size={14} />}
              loading={busy}
              onClick={importSchema}
            >
              Import schema
            </Button>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 2, md: 5 }}>
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
              Health
            </Text>
            <Group gap={6}>
              <IconHeartbeat
                size={16}
                color={
                  health.data?.ready
                    ? 'var(--mantine-color-teal-5)'
                    : health.data?.live
                      ? 'var(--mantine-color-yellow-5)'
                      : undefined
                }
              />
              <Text fw={600}>{healthLabel}</Text>
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

        {me.data && (
          <Alert color="gray" p="xs">
            <Text size="xs">
              Connected as <b>{me.data.id}</b>
              {me.data.roles.length > 0 ? ` with roles: ${me.data.roles.join(', ')}` : ' (no roles assigned)'}
            </Text>
          </Alert>
        )}

        {/* A stock image enables dozens of modules, so show a sample and send
            the reader to the Meta tab for the full list with each one's config. */}
        {moduleNames.length > 0 && (
          <Group gap={6}>
            {moduleNames.slice(0, MODULE_PREVIEW).map((m) => (
              <Badge key={m} variant="light" color="aqua">
                {m}
              </Badge>
            ))}
            {moduleNames.length > MODULE_PREVIEW && (
              <Badge
                variant="outline"
                color="gray"
                style={{ cursor: 'pointer' }}
                onClick={() => setTab('meta')}
              >
                +{moduleNames.length - MODULE_PREVIEW} more
              </Badge>
            )}
          </Group>
        )}

        <Text c="dimmed" size="sm">
          Select a collection in the sidebar to browse data, view its schema, or run searches.
        </Text>

        <Tabs value={tab} onChange={setTab}>
          <Tabs.List mb="sm">
            <Tabs.Tab value="console" leftSection={<IconTerminal2 size={15} />}>
              Console
            </Tabs.Tab>
            <Tabs.Tab value="tokenizer" leftSection={<IconWand size={15} />}>
              Tokenizer
            </Tabs.Tab>
            <Tabs.Tab value="nodes">Nodes</Tabs.Tab>
            <Tabs.Tab value="meta">Meta</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="console">
            <Paper withBorder p="md">
              <RawConsole connectionId={connectionId} />
            </Paper>
          </Tabs.Panel>
          <Tabs.Panel value="tokenizer">
            <Paper withBorder p="md">
              <TokenizerPreview connectionId={connectionId} />
            </Paper>
          </Tabs.Panel>
          <Tabs.Panel value="nodes">
            {clusterNodes.isLoading || nodes.isLoading ? (
              <Loader />
            ) : (
              <InspectPanel name="nodes" value={nodes.data?.nodes ?? []} maxHeight={480}>
                <NodeCards nodes={clusterNodes.data ?? []} />
              </InspectPanel>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="meta">
            {meta.isLoading ? (
              <Loader />
            ) : (
              <InspectPanel name="meta" value={meta.data ?? {}} maxHeight={480}>
                <MetaView meta={meta.data ?? {}} />
              </InspectPanel>
            )}
          </Tabs.Panel>
        </Tabs>

        {health.data && !health.data.live && (
          <Alert color="orange" icon={<IconAlertTriangle />}>
            The instance is not reporting as live. Queries will likely fail until it recovers.
          </Alert>
        )}
      </Stack>
    </Box>
  )
}
