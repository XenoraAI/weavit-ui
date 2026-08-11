import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Tooltip,
  Menu,
  ActionIcon,
  Accordion
} from '@mantine/core'
import {
  IconSearch,
  IconAlertTriangle,
  IconHistory,
  IconCode,
  IconDownload,
  IconUpload,
  IconDots
} from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import type {
  FilterNode,
  NearMediaKind,
  ReferenceConfig,
  SearchRequest,
  SearchResult,
  SearchType,
  WeaviateObject
} from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { downloadText, pickBinaryFile, toCsv, toJson } from '../../lib/exportFile'
import { FilterBuilder } from './FilterBuilder'
import { AdvancedOptions } from './AdvancedOptions'
import { CodeModal } from './CodeModal'
import { HistoryDrawer } from './HistoryDrawer'
import { ObjectDrawer } from '../data/ObjectDrawer'

interface Props {
  connectionId: string
  collection: string
  tenant?: string
  properties: string[]
  /** Cross-references, so filters can reach into the referenced objects. */
  references?: ReferenceConfig[]
  /** Collection vectorizer; undefined or 'none' means no server-side embedding. */
  vectorizer?: string
  namedVectors?: string[]
  hasReranker?: boolean
  /** Pre-seed a "more like this" search from elsewhere in the app. */
  initialRequest?: Partial<SearchRequest>
}

const SEARCH_TYPES: { label: string; value: SearchType }[] = [
  { label: 'Fetch', value: 'fetch' },
  { label: 'Near text', value: 'nearText' },
  { label: 'BM25', value: 'bm25' },
  { label: 'Hybrid', value: 'hybrid' },
  { label: 'Near vector', value: 'nearVector' },
  { label: 'Near object', value: 'nearObject' },
  { label: 'Near image', value: 'nearImage' },
  { label: 'Near media', value: 'nearMedia' }
]

const MEDIA_KINDS: NearMediaKind[] = ['image', 'audio', 'video', 'depth', 'thermal', 'imu']

function metaText(o: WeaviateObject): string | undefined {
  const m = o.metadata ?? {}
  if (m.distance != null) return `dist ${Number(m.distance).toFixed(4)}`
  if (m.score != null) return `score ${Number(m.score).toFixed(4)}`
  if (m.certainty != null) return `cert ${Number(m.certainty).toFixed(4)}`
  return undefined
}

/** nearText and hybrid ask Weaviate to embed the query string server-side. */
const NEEDS_VECTORIZER: SearchType[] = ['nearText', 'hybrid']
/** These need a multi-modal (multi2vec) module, not just any vectorizer. */
const MEDIA_TYPES: SearchType[] = ['nearImage', 'nearMedia']

interface VectorCheck {
  error?: string
  /** Human-readable description of what was pasted, e.g. "768 dimensions". */
  shape?: string
}

function isVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/**
 * Mirrors what the main process accepts: a plain vector, a multi-vector
 * (one vector per token, as ColBERT-style spaces store), or an object naming a
 * vector per space. `shape` is what the field reports back to the user.
 */
function checkVector(text: string): VectorCheck {
  const t = text.trim()
  if (!t) return { error: 'Paste a JSON array of numbers' }
  let parsed: unknown
  try {
    parsed = JSON.parse(t)
  } catch {
    return { error: 'Not valid JSON' }
  }

  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (entries.length === 0) return { error: 'Name at least one vector' }
    const bad = entries.find(([, v]) => !isVector(v) && !(Array.isArray(v) && v.every(isVector)))
    if (bad) return { error: `"${bad[0]}" is not a vector` }
    return { shape: `${entries.length} named vector${entries.length > 1 ? 's' : ''}` }
  }

  if (isVector(parsed)) return { shape: `${parsed.length} dimensions` }
  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((v) => Array.isArray(v))) {
    if (!parsed.every(isVector)) return { error: 'All elements must be finite numbers' }
    return { shape: `multi-vector, ${parsed.length} × ${(parsed[0] as number[]).length}` }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: 'Expected a non-empty JSON array' }
  }
  return { error: 'All elements must be finite numbers' }
}

export function QueryPanel({
  connectionId,
  collection,
  tenant,
  properties,
  references = [],
  vectorizer,
  namedVectors = [],
  hasReranker = false,
  initialRequest
}: Props) {
  const [type, setType] = useState<SearchType>('fetch')
  const [queryText, setQueryText] = useState('')
  const [queryVector, setQueryVector] = useState('')
  const [queryObjectId, setQueryObjectId] = useState('')
  const [queryMedia, setQueryMedia] = useState('')
  const [mediaName, setMediaName] = useState('')
  const [mediaKind, setMediaKind] = useState<NearMediaKind>('image')
  const [alpha, setAlpha] = useState(0.5)
  const [targetVector, setTargetVector] = useState('')
  const [limit, setLimit] = useState(10)
  const [includeVector, setIncludeVector] = useState(false)
  const [returnProperties, setReturnProperties] = useState<string[]>([])
  const [filters, setFilters] = useState<FilterNode[]>([])
  const [selected, setSelected] = useState<WeaviateObject | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  /** Everything from AdvancedOptions that has no dedicated state above. */
  const [extras, setExtras] = useState<Partial<SearchRequest>>({})

  const request = useMemo<SearchRequest>(
    () => ({
      connectionId,
      collection,
      type,
      tenant,
      limit,
      includeVector,
      queryText,
      queryVector,
      queryObjectId: queryObjectId.trim() || undefined,
      queryMedia: queryMedia || undefined,
      mediaKind: type === 'nearMedia' ? mediaKind : undefined,
      alpha,
      targetVector: targetVector.trim() || undefined,
      returnProperties,
      filters,
      ...extras
    }),
    [
      connectionId,
      collection,
      type,
      tenant,
      limit,
      includeVector,
      queryText,
      queryVector,
      queryObjectId,
      queryMedia,
      mediaKind,
      alpha,
      targetVector,
      returnProperties,
      filters,
      extras
    ]
  )

  /** Restores a stored query into every piece of panel state. */
  const loadRequest = useCallback((req: Partial<SearchRequest>) => {
    if (req.type) setType(req.type)
    if (req.queryText !== undefined) setQueryText(req.queryText ?? '')
    if (req.queryVector !== undefined) setQueryVector(req.queryVector ?? '')
    if (req.queryObjectId !== undefined) setQueryObjectId(req.queryObjectId ?? '')
    if (req.alpha !== undefined) setAlpha(req.alpha ?? 0.5)
    if (req.targetVector !== undefined) setTargetVector(req.targetVector ?? '')
    if (req.limit !== undefined) setLimit(req.limit)
    if (req.includeVector !== undefined) setIncludeVector(req.includeVector)
    if (req.returnProperties !== undefined) setReturnProperties(req.returnProperties ?? [])
    if (req.filters !== undefined) setFilters(req.filters ?? [])
    setExtras({
      offset: req.offset,
      autoLimit: req.autoLimit,
      consistencyLevel: req.consistencyLevel,
      distance: req.distance,
      certainty: req.certainty,
      moveTo: req.moveTo,
      moveAway: req.moveAway,
      queryProperties: req.queryProperties,
      bm25Operator: req.bm25Operator,
      fusionType: req.fusionType,
      maxVectorDistance: req.maxVectorDistance,
      multiTarget: req.multiTarget,
      sort: req.sort,
      groupBy: req.groupBy,
      rerank: req.rerank,
      diversity: req.diversity,
      vectorNames: req.vectorNames
    })
  }, [])

  // A "more like this" hand-off from the object drawer arrives this way.
  useEffect(() => {
    if (initialRequest) loadRequest(initialRequest)
  }, [initialRequest, loadRequest])

  // Identifies the run so it can be cancelled, and remembers that we asked —
  // an aborted call fails, and that failure isn't news to the user.
  const runId = useRef<string | null>(null)
  const cancelled = useRef(false)

  const search = useMutation<SearchResult, Error>({
    mutationFn: () => {
      const requestId = crypto.randomUUID()
      runId.current = requestId
      cancelled.current = false
      return api.query.search({ ...request, requestId })
    },
    onSuccess: (result) => {
      // History is a convenience, not part of the result — never let a failure
      // to record it surface as a failed search.
      void api.history
        .record({
          connectionId,
          collection,
          request,
          resultCount: result.objects.length
        })
        .catch(() => undefined)
    },
    onError: (e) => {
      if (cancelled.current) return
      notifyErr(e, 'Search failed')
    }
  })

  const cancelSearch = () => {
    if (!runId.current) return
    cancelled.current = true
    void api.query.cancel(runId.current).catch(() => undefined)
  }

  const results = search.data?.objects ?? []
  const groups = search.data?.groups
  const columns =
    returnProperties.length > 0
      ? returnProperties
      : [...new Set(results.flatMap((o) => Object.keys(o.properties)))]

  const needsText = type === 'nearText' || type === 'bm25' || type === 'hybrid'

  // Fail open while the config is still loading, or if we couldn't read the
  // vectorizer at all — only block when Weaviate affirmatively reports 'none'.
  const canVectorizeText = vectorizer == null || vectorizer.toLowerCase() !== 'none'
  const isMultiModal = vectorizer?.startsWith('multi2vec') ?? false
  // The "why" rides on the disabled tabs as a tooltip rather than a standing
  // banner — it's only of interest to someone reaching for a blocked mode.
  const searchTypes = SEARCH_TYPES.map((t) => {
    const noVectorizer = !canVectorizeText && NEEDS_VECTORIZER.includes(t.value)
    const noMultiModal = vectorizer != null && !isMultiModal && MEDIA_TYPES.includes(t.value)
    if (!noVectorizer && !noMultiModal) return t
    return {
      value: t.value,
      disabled: true,
      label: (
        <Tooltip
          multiline
          w={280}
          withArrow
          label={
            noVectorizer
              ? 'vectorizer: none — Weaviate has no module to embed the query text for this collection. Use Near vector with a precomputed embedding, or BM25 for keyword search.'
              : `This collection uses ${vectorizer}, which cannot embed media. Media search needs a multi2vec module.`
          }
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
    if (vectorizer != null && !isMultiModal && MEDIA_TYPES.includes(type)) setType('fetch')
  }, [canVectorizeText, isMultiModal, vectorizer, type])

  const usesVector = type === 'nearVector' || (type === 'hybrid' && queryVector.trim() !== '')
  const vectorCheck = useMemo(
    () => (usesVector ? checkVector(queryVector) : {}),
    [usesVector, queryVector]
  )
  const vectorInvalid = usesVector && vectorCheck.error != null

  const chooseMedia = async () => {
    const accept = mediaKind === 'image' || type === 'nearImage' ? 'image/*' : '*/*'
    const file = await pickBinaryFile(accept)
    if (!file) return
    setQueryMedia(file.base64)
    setMediaName(file.name)
  }

  const exportResults = (format: 'csv' | 'json') => {
    if (results.length === 0) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    if (format === 'csv') {
      downloadText(`${collection}-results-${stamp}.csv`, toCsv(results, includeVector), 'text/csv')
    } else {
      downloadText(`${collection}-results-${stamp}.json`, toJson(results), 'application/json')
    }
    notifyOk(`Exported ${results.length} results`)
  }

  const patchExtras = (p: Partial<SearchRequest>) => setExtras((e) => ({ ...e, ...p }))

  return (
    <Box style={{ height: '100%', overflow: 'auto' }} p="md">
      <Paper withBorder p="md" mb="md">
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <SegmentedControl
              data={searchTypes}
              value={type}
              onChange={(v) => setType(v as SearchType)}
            />
            <Group gap={4} wrap="nowrap">
              <Tooltip label="Recent & saved queries">
                <ActionIcon variant="light" onClick={() => setShowHistory(true)}>
                  <IconHistory size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Show as code">
                <ActionIcon variant="light" onClick={() => setShowCode(true)}>
                  <IconCode size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          {needsText && (
            <TextInput
              label="Query text"
              placeholder="what are you searching for?"
              value={queryText}
              onChange={(e) => setQueryText(e.currentTarget.value)}
            />
          )}
          {(type === 'nearVector' || type === 'hybrid') && (
            <Textarea
              label={type === 'hybrid' ? 'Query vector (optional)' : 'Query vector (JSON array)'}
              placeholder='[0.12, 0.98, …] · [[…], […]] · {"title": […]}'
              autosize
              minRows={2}
              value={queryVector}
              onChange={(e) => setQueryVector(e.currentTarget.value)}
              error={queryVector.trim() ? vectorCheck.error : undefined}
              description={
                vectorCheck.shape ??
                (type === 'hybrid'
                  ? 'Supply your own embedding, or leave empty to let Weaviate vectorize the query text'
                  : undefined)
              }
            />
          )}
          {type === 'nearObject' && (
            <TextInput
              label="Source object UUID"
              description="Finds objects nearest to this one"
              placeholder="e.g. 8f2c…"
              value={queryObjectId}
              onChange={(e) => setQueryObjectId(e.currentTarget.value)}
            />
          )}
          {(type === 'nearImage' || type === 'nearMedia') && (
            <Group align="end" grow>
              <Button variant="light" leftSection={<IconUpload size={15} />} onClick={chooseMedia}>
                {mediaName || 'Choose a file'}
              </Button>
              {type === 'nearMedia' && (
                <MultiSelect
                  label="Media kind"
                  data={MEDIA_KINDS}
                  value={[mediaKind]}
                  maxValues={1}
                  onChange={(v) => setMediaKind((v[0] as NearMediaKind) ?? 'image')}
                />
              )}
            </Group>
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
            <MultiSelect
              label="Target vector (optional)"
              placeholder={namedVectors.length ? 'named vector' : 'no named vectors'}
              data={namedVectors}
              value={targetVector ? [targetVector] : []}
              maxValues={1}
              searchable
              clearable
              onChange={(v) => setTargetVector(v[0] ?? '')}
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

          <FilterBuilder
            value={filters}
            onChange={setFilters}
            properties={properties}
            references={references}
          />

          <Accordion variant="separated" chevronPosition="left">
            <Accordion.Item value="advanced">
              <Accordion.Control>
                <Text size="sm">Advanced options</Text>
              </Accordion.Control>
              <Accordion.Panel>
                <AdvancedOptions
                  req={request}
                  patch={patchExtras}
                  properties={properties}
                  namedVectors={namedVectors}
                  hasReranker={hasReranker}
                />
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Group justify="space-between">
            <Switch
              label="Include vectors"
              checked={includeVector}
              onChange={(e) => setIncludeVector(e.currentTarget.checked)}
            />
            <Group gap="xs">
              {search.isPending && (
                <Button variant="light" color="gray" onClick={cancelSearch}>
                  Cancel
                </Button>
              )}
              <Button
                leftSection={<IconSearch size={16} />}
                loading={search.isPending}
                disabled={vectorInvalid}
                onClick={() => search.mutate()}
              >
                Run search
              </Button>
            </Group>
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
          <Group mb="xs" justify="space-between">
            <Group gap="xs">
              <Badge variant="light">{results.length} results</Badge>
              {groups && <Badge variant="light" color="grape">{groups.length} groups</Badge>}
              {search.data.took != null && (
                <Text size="xs" c="dimmed">
                  {search.data.took} ms
                </Text>
              )}
            </Group>
            {results.length > 0 && (
              <Menu position="bottom-end" withArrow>
                <Menu.Target>
                  <Button size="compact-xs" variant="light" leftSection={<IconDownload size={13} />} rightSection={<IconDots size={13} />}>
                    Export
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => exportResults('csv')}>Download CSV</Menu.Item>
                  <Menu.Item onClick={() => exportResults('json')}>Download JSON</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>

          {groups && groups.length > 0 && (
            <Stack gap="xs" mb="md">
              {groups.map((g) => (
                <Paper key={g.name} withBorder p="xs">
                  <Group gap="xs" mb={6}>
                    <Badge variant="light" color="grape">
                      {g.name || '(empty)'}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      {g.numberOfObjects} objects
                      {g.minDistance != null && ` · closest ${g.minDistance.toFixed(4)}`}
                    </Text>
                  </Group>
                  <Stack gap={2}>
                    {g.objects.map((o) => (
                      <Text
                        key={o.uuid}
                        size="xs"
                        className="weft-mono weft-clickable weft-truncate"
                        onClick={() => setSelected(o)}
                      >
                        {o.uuid.slice(0, 8)}… {JSON.stringify(o.properties).slice(0, 120)}
                      </Text>
                    ))}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}

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
            !groups?.length && <Text c="dimmed">No results.</Text>
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
          onFindSimilar={(uuid) => {
            setSelected(null)
            setType('nearObject')
            setQueryObjectId(uuid)
          }}
        />
      )}

      {showCode && <CodeModal request={request} onClose={() => setShowCode(false)} />}
      {showHistory && (
        <HistoryDrawer
          connectionId={connectionId}
          collection={collection}
          current={request}
          onLoad={loadRequest}
          onClose={() => setShowHistory(false)}
        />
      )}
    </Box>
  )
}
