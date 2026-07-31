import { Stack, Group, Text, Tabs, Select, Badge, Box, Loader } from '@mantine/core'
import { IconTable, IconSchema, IconSearch } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useApp, type MainTab } from '../../store'
import { DataBrowser } from '../data/DataBrowser'
import { CollectionDetail } from './CollectionDetail'
import { QueryPanel } from '../query/QueryPanel'
import { ErrorBoundary } from '../../components/ErrorBoundary'

interface Props {
  connectionId: string
  collection: string
}

export function CollectionView({ connectionId, collection }: Props) {
  const mainTab = useApp((s) => s.mainTab)
  const setMainTab = useApp((s) => s.setMainTab)
  const selectedTenant = useApp((s) => s.selectedTenant)
  const setSelectedTenant = useApp((s) => s.setSelectedTenant)

  const config = useQuery({
    queryKey: ['collection', connectionId, collection],
    queryFn: () => api.schema.getCollection(connectionId, collection)
  })

  const mtEnabled = config.data?.multiTenancy.enabled ?? false

  const tenants = useQuery({
    queryKey: ['tenants', connectionId, collection],
    queryFn: () => api.schema.listTenants(connectionId, collection),
    enabled: mtEnabled
  })

  return (
    <Stack h="100%" gap={0}>
      <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Text fw={700} size="lg">
              {collection}
            </Text>
            {config.data?.vectorizer && (
              <Badge variant="light" color="aqua">
                {config.data.vectorizer}
              </Badge>
            )}
            {mtEnabled && (
              <Badge variant="light" color="grape">
                multi-tenant
              </Badge>
            )}
            {config.isLoading && <Loader size="xs" />}
          </Group>

          {mtEnabled && (
            <Select
              size="xs"
              placeholder="Select tenant"
              searchable
              w={220}
              data={(tenants.data ?? []).map((t) => t.name)}
              value={selectedTenant ?? null}
              onChange={(v) => setSelectedTenant(v ?? undefined)}
              nothingFoundMessage="No tenants"
            />
          )}
        </Group>
      </Box>

      <Tabs
        value={mainTab}
        onChange={(v) => setMainTab((v as MainTab) ?? 'data')}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <Tabs.List px="md">
          <Tabs.Tab value="data" leftSection={<IconTable size={15} />}>
            Data
          </Tabs.Tab>
          <Tabs.Tab value="schema" leftSection={<IconSchema size={15} />}>
            Schema
          </Tabs.Tab>
          <Tabs.Tab value="query" leftSection={<IconSearch size={15} />}>
            Query
          </Tabs.Tab>
        </Tabs.List>

        <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ErrorBoundary resetKey={`${collection}:${mainTab}`}>
            {mainTab === 'data' && (
              <DataBrowser
                connectionId={connectionId}
                collection={collection}
                tenant={mtEnabled ? selectedTenant : undefined}
                mtEnabled={mtEnabled}
              />
            )}
            {mainTab === 'schema' && (
              <CollectionDetail connectionId={connectionId} collection={collection} />
            )}
            {mainTab === 'query' && (
              <QueryPanel
                connectionId={connectionId}
                collection={collection}
                tenant={mtEnabled ? selectedTenant : undefined}
                properties={(config.data?.properties ?? []).map((p) => p.name)}
              />
            )}
          </ErrorBoundary>
        </Box>
      </Tabs>
    </Stack>
  )
}
