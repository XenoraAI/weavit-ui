import { useEffect, useMemo, useState } from 'react'
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
  Alert,
  Tooltip
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
  /** Collection vectorizer; undefined or 'none' means no server-side embedding. */
  vectorizer?: string
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

/** nearText and hybrid ask Weaviate to embed the query string server-side. */
const NEEDS_VECTORIZER: SearchType[] = ['nearText', 'hybrid']

interface VectorCheck {
  error?: string
  dims?: number
}

function checkVector(text: string): VectorCheck {
  const t = text.trim()
  if (!t) return { error: 'Paste a JSON array of numbers' }
  let parsed: unknown
  try {
    parsed = JSON.parse(t)
  } catch {
    return { error: 'Not valid JSON' }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: 'Expected a non-empty JSON array' }
  }
  if (parsed.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    return { error: 'All elements must be finite numbers' }
  }
  return { dims: parsed.length }
}

export function QueryPanel({ connectionId, collection, tenant, properties, vectorizer }: Props) {
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

  // Fail open while the config is still loading, or if we couldn't read the
  // vectorizer at all — only block when Weaviate affirmatively reports 'none'.
  const canVectorizeText = vectorizer == null || vectorizer.toLowerCase() !== 'none'
  // The "why" rides on the disabled tabs as a tooltip rather than a standing
  // banner — it's only of interest to someone reaching for Near text / Hybrid.
  const searchTypes = SEARCH_TYPES.map((t) => {
    const blocked = !canVectorizeText && NEEDS_VECTORIZER.includes(t.value)
    if (!blocked) return t
    return {
      value: t.value,
      disabled: true,
      label: (
        <Tooltip
          multiline
          w={280}
          withArrow
          label="vectorizer: none — Weaviate has no module to embed the query text for this collection. Use Near vector with a precomputed embedding, or BM25 for keyword search."
        >
          <span>{t.label}</span>
        </Tooltip>
      )
    }
  })

  // Vectorizer is only known once the collection config loads, so a disabled
  // type can already be selected — fall back rather than let it 500 on Weaviate.
  useEffect(() => {
    if (!canVectorizeText && NEEDS_VECTORIZER.includes(type)) setType('fetch')
  }, [canVectorizeText, type])

  const vectorCheck = useMemo(
    () => (type === 'nearVector' ? checkVector(queryVector) : {}),
    [type, queryVector]
  )
  const vectorInvalid = type === 'nearVector' && vectorCheck.error != null

  return (
    <Box style={{ height: '100%', overflow: 'auto' }} p="md">
      <Paper withBorder p="md" mb="md">
        <Stack gap="sm">
          <SegmentedControl
            data={searchTypes}
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
              error={queryVector.trim() ? vectorCheck.error : undefined}
              description={vectorCheck.dims ? `${vectorCheck.dims} dimensions` : undefined}
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
              disabled={vectorInvalid}
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
