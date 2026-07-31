import { useState } from 'react'
import {
  Box,
  Stack,
  Group,
  SegmentedControl,
  TextInput,
  Textarea,
  NumberInput,
  Switch,
  Button,
  Paper,
  Text,
  Slider,
  MultiSelect,
  Table,
  Center,
  Loader,
  Badge,
  Alert
} from '@mantine/core'
import { IconSearch, IconAlertTriangle } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import type { FilterCondition, SearchRequest, SearchResult, SearchType, WeaviateObject } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr } from '../../lib/notify'
import { FilterBuilder } from './FilterBuilder'
import { ObjectDrawer } from '../data/ObjectDrawer'

interface Props {
  connectionId: string
  collection: string
  tenant?: string
  properties: string[]
}

const SEARCH_TYPES: { label: string; value: SearchType }[] = [
  { label: 'Fetch', value: 'fetch' },
  { label: 'Near text', value: 'nearText' },
  { label: 'BM25', value: 'bm25' },
  { label: 'Hybrid', value: 'hybrid' },
  { label: 'Near vector', value: 'nearVector' }
]

function metaText(o: WeaviateObject): string | undefined {
  const m = o.metadata ?? {}
  if (m.distance != null) return `dist ${Number(m.distance).toFixed(4)}`
  if (m.score != null) return `score ${Number(m.score).toFixed(4)}`
  if (m.certainty != null) return `cert ${Number(m.certainty).toFixed(4)}`
  return undefined
}

export function QueryPanel({ connectionId, collection, tenant, properties }: Props) {
  const [type, setType] = useState<SearchType>('fetch')
  const [queryText, setQueryText] = useState('')
  const [queryVector, setQueryVector] = useState('')
  const [alpha, setAlpha] = useState(0.5)
  const [targetVector, setTargetVector] = useState('')
  const [limit, setLimit] = useState(10)
  const [includeVector, setIncludeVector] = useState(false)
  const [returnProperties, setReturnProperties] = useState<string[]>([])
  const [filters, setFilters] = useState<FilterCondition[]>([])
  const [selected, setSelected] = useState<WeaviateObject | null>(null)

  const search = useMutation<SearchResult, Error>({
    mutationFn: () => {
      const req: SearchRequest = {
        connectionId,
        collection,
        type,
        tenant,
        limit,
        includeVector,
        queryText,
        queryVector,
        alpha,
        targetVector: targetVector.trim() || undefined,
        returnProperties,
        filters
      }
      return api.query.search(req)
    },
    onError: (e) => notifyErr(e, 'Search failed')
  })

  const results = search.data?.objects ?? []
  const columns =
    returnProperties.length > 0
      ? returnProperties
      : [...new Set(results.flatMap((o) => Object.keys(o.properties)))]

  const needsText = type === 'nearText' || type === 'bm25' || type === 'hybrid'

  return (
    <Box style={{ height: '100%', overflow: 'auto' }} p="md">
      <Paper withBorder p="md" mb="md">
        <Stack gap="sm">
          <SegmentedControl
            data={SEARCH_TYPES}
            value={type}
            onChange={(v) => setType(v as SearchType)}
          />

          {needsText && (
            <TextInput
              label="Query text"
              placeholder="what are you searching for?"
              value={queryText}
              onChange={(e) => setQueryText(e.currentTarget.value)}
            />
          )}
          {type === 'nearVector' && (
            <Textarea
              label="Query vector (JSON array)"
              placeholder="[0.12, 0.98, …]"
              autosize
              minRows={2}
              value={queryVector}
              onChange={(e) => setQueryVector(e.currentTarget.value)}
            />
          )}
          {type === 'hybrid' && (
            <div>
              <Text size="sm" fw={500}>
                Alpha: {alpha.toFixed(2)}{' '}
                <Text span size="xs" c="dimmed">
                  (0 = keyword, 1 = vector)
                </Text>
              </Text>
              <Slider min={0} max={1} step={0.05} value={alpha} onChange={setAlpha} />
            </div>
          )}

          <Group grow align="end">
            <NumberInput label="Limit" min={1} max={1000} value={limit} onChange={(v) => setLimit(Number(v))} />
            <TextInput
              label="Target vector (optional)"
              placeholder="named vector"
              value={targetVector}
              onChange={(e) => setTargetVector(e.currentTarget.value)}
            />
            <MultiSelect
              label="Return properties (optional)"
              data={properties}
              value={returnProperties}
              onChange={setReturnProperties}
              searchable
              clearable
            />
          </Group>

          <FilterBuilder value={filters} onChange={setFilters} properties={properties} />

          <Group justify="space-between">
            <Switch
              label="Include vectors"
              checked={includeVector}
              onChange={(e) => setIncludeVector(e.currentTarget.checked)}
            />
            <Button
              leftSection={<IconSearch size={16} />}
              loading={search.isPending}
              onClick={() => search.mutate()}
            >
              Run search
            </Button>
          </Group>
        </Stack>
      </Paper>

      {search.isPending && (
        <Center h={120}>
          <Loader />
        </Center>
      )}
      {search.isError && (
        <Alert color="red" icon={<IconAlertTriangle />} title="Search failed">
          {search.error.message}
        </Alert>
      )}
      {search.data && (
        <>
          <Group mb="xs">
            <Badge variant="light">{results.length} results</Badge>
          </Group>
          {results.length > 0 ? (
            <Table striped highlightOnHover withTableBorder className="weft-mono" style={{ fontSize: 12.5 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>id</Table.Th>
                  <Table.Th>match</Table.Th>
                  {columns.map((c) => (
                    <Table.Th key={c}>{c}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {results.map((o) => (
                  <Table.Tr key={o.uuid} className="weft-clickable" onClick={() => setSelected(o)}>
                    <Table.Td>
                      <Text size="xs" c="aqua.4" title={o.uuid}>
                        {o.uuid.slice(0, 8)}…
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {metaText(o) ?? '—'}
                      </Text>
                    </Table.Td>
                    {columns.map((c) => {
                      const v = o.properties[c]
                      const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
                      return (
                        <Table.Td key={c}>
                          <div className="weft-truncate" title={t}>
                            {t}
                          </div>
                        </Table.Td>
                      )
                    })}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed">No results.</Text>
          )}
        </>
      )}

      {selected && (
        <ObjectDrawer
          connectionId={connectionId}
          collection={collection}
          tenant={tenant}
          object={selected}
          onClose={() => setSelected(null)}
          onChanged={() => setSelected(null)}
        />
      )}
    </Box>
  )
}
