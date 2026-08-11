import { useRef, useState } from 'react'
import {
  Box,
  Stack,
  Group,
  Paper,
  Text,
  Textarea,
  TextInput,
  SegmentedControl,
  NumberInput,
  Button,
  Slider,
  MultiSelect,
  Select,
  Alert,
  Center,
  Loader,
  Badge,
  Divider,
  Switch,
  Accordion,
  Code
} from '@mantine/core'
import { IconSparkles, IconAlertTriangle, IconUpload } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import type {
  FilterNode,
  GenerateResult,
  GenerativeProvider,
  GenerativeUsage,
  NearMediaKind,
  ReferenceConfig,
  SearchRequest,
  SearchType
} from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr } from '../../lib/notify'
import { pickBinaryFile } from '../../lib/exportFile'
import { FilterBuilder } from '../query/FilterBuilder'
import { AdvancedOptions } from '../query/AdvancedOptions'

interface Props {
  connectionId: string
  collection: string
  tenant?: string
  properties: string[]
  /** Cross-references, so filters can reach into the referenced objects. */
  references?: ReferenceConfig[]
  /** The collection's generative module, if one is configured. */
  generative?: string
  vectorizer?: string
  namedVectors?: string[]
  hasReranker?: boolean
}

// Every retrieval kind `dispatchSearch` can route to. RAG is an ordinary
// search with prompts attached, so all of them are legal here.
const RETRIEVAL_TYPES: { label: string; value: SearchType }[] = [
  { label: 'Near text', value: 'nearText' },
  { label: 'Hybrid', value: 'hybrid' },
  { label: 'BM25', value: 'bm25' },
  { label: 'Near vector', value: 'nearVector' },
  { label: 'Near object', value: 'nearObject' },
  { label: 'Near image', value: 'nearImage' },
  { label: 'Near media', value: 'nearMedia' },
  { label: 'Fetch', value: 'fetch' }
]

const TEXT_TYPES: SearchType[] = ['nearText', 'hybrid', 'bm25']
const MEDIA_KINDS = ['image', 'audio', 'video', 'thermal', 'depth', 'imu']

/** Values match the client's `generativeParameters` factory names exactly. */
const PROVIDERS: { label: string; value: GenerativeProvider }[] = [
  { label: 'OpenAI', value: 'openAI' },
  { label: 'Azure OpenAI', value: 'azureOpenAI' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Cohere', value: 'cohere' },
  { label: 'Google', value: 'google' },
  { label: 'Mistral', value: 'mistral' },
  { label: 'Ollama', value: 'ollama' },
  { label: 'xAI', value: 'xai' },
  { label: 'NVIDIA', value: 'nvidia' },
  { label: 'AWS', value: 'aws' },
  { label: 'Databricks', value: 'databricks' },
  { label: 'Anyscale', value: 'anyscale' },
  { label: 'FriendliAI', value: 'friendliai' },
  { label: 'Contextual AI', value: 'contextualai' }
]

/** Providers whose endpoint is routinely self-hosted and worth prompting for. */
const ENDPOINT_PROVIDERS = new Set<GenerativeProvider>(['ollama', 'aws', 'databricks'])

const COLLECTION_DEFAULT = ''

/** Token counts, only present when the provider reported them. */
function UsageBadge({ usage }: { usage?: GenerativeUsage }) {
  if (!usage?.totalTokens && !usage?.promptTokens) return null
  const parts = [
    usage.promptTokens != null ? `${usage.promptTokens} in` : null,
    usage.completionTokens != null ? `${usage.completionTokens} out` : null,
    usage.totalTokens != null ? `${usage.totalTokens} total` : null
  ].filter(Boolean)
  return (
    <Badge size="xs" variant="light" color="gray">
      {parts.join(' · ')}
    </Badge>
  )
}

/**
 * Retrieval-augmented generation. Retrieval is an ordinary search; the prompts
 * are what make it RAG. A single prompt runs once per retrieved object and can
 * interpolate that object's properties with {braces}; a grouped task runs once
 * across the whole result set.
 */
export function GeneratePanel({
  connectionId,
  collection,
  tenant,
  properties,
  references = [],
  generative,
  vectorizer,
  namedVectors = [],
  hasReranker = false
}: Props) {
  const [type, setType] = useState<SearchType>('nearText')
  const [queryText, setQueryText] = useState('')
  const [queryVector, setQueryVector] = useState('')
  const [queryObjectId, setQueryObjectId] = useState('')
  const [queryMedia, setQueryMedia] = useState('')
  const [mediaName, setMediaName] = useState('')
  const [mediaKind, setMediaKind] = useState<NearMediaKind>('image')
  const [alpha, setAlpha] = useState(0.5)
  const [limit, setLimit] = useState(5)
  const [targetVector, setTargetVector] = useState('')
  const [returnProperties, setReturnProperties] = useState<string[]>([])
  const [filters, setFilters] = useState<FilterNode[]>([])
  /** Everything from AdvancedOptions that has no dedicated state above. */
  const [extras, setExtras] = useState<Partial<SearchRequest>>({})

  const [singlePrompt, setSinglePrompt] = useState('')
  const [groupedTask, setGroupedTask] = useState('')
  const [groupedProperties, setGroupedProperties] = useState<string[]>([])
  const [imageProperties, setImageProperties] = useState<string[]>([])
  const [provider, setProvider] = useState<GenerativeProvider | ''>(COLLECTION_DEFAULT)
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [temperature, setTemperature] = useState<number | ''>('')
  const [maxTokens, setMaxTokens] = useState<number | ''>('')
  const [topP, setTopP] = useState<number | ''>('')
  const [stop, setStop] = useState('')
  const [resourceName, setResourceName] = useState('')
  const [deploymentId, setDeploymentId] = useState('')
  const [apiVersion, setApiVersion] = useState('')
  const [returnMetadata, setReturnMetadata] = useState(false)
  const [debug, setDebug] = useState(false)

  const patchExtras = (p: Partial<SearchRequest>) => setExtras((e) => ({ ...e, ...p }))

  const chooseMedia = async () => {
    const accept = mediaKind === 'image' || type === 'nearImage' ? 'image/*' : '*/*'
    const picked = await pickBinaryFile(accept)
    if (!picked) return
    setQueryMedia(picked.base64)
    setMediaName(picked.name)
  }

  const search: SearchRequest = {
    connectionId,
    collection,
    type,
    tenant,
    limit,
    includeVector: false,
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
  }

  // Identifies the run so it can be cancelled, and remembers that we asked —
  // an aborted call fails, and that failure isn't news to the user.
  const runId = useRef<string | null>(null)
  const cancelled = useRef(false)

  const run = useMutation<GenerateResult, Error>({
    mutationFn: () => {
      const requestId = crypto.randomUUID()
      runId.current = requestId
      cancelled.current = false
      return api.query.generate({
        search: { ...search, requestId },
        singlePrompt: singlePrompt.trim() || undefined,
        groupedTask: groupedTask.trim() || undefined,
        groupedProperties,
        imageProperties,
        provider: provider || undefined,
        model: model.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        temperature: temperature === '' ? undefined : temperature,
        maxTokens: maxTokens === '' ? undefined : maxTokens,
        topP: topP === '' ? undefined : topP,
        stop: stop.trim() ? stop.split(',').map((s) => s.trim()) : undefined,
        resourceName: resourceName.trim() || undefined,
        deploymentId: deploymentId.trim() || undefined,
        apiVersion: apiVersion.trim() || undefined,
        returnMetadata,
        debug
      })
    },
    onError: (e) => {
      if (cancelled.current) return
      notifyErr(e, 'Generation failed')
    }
  })

  const cancelRun = () => {
    if (!runId.current) return
    cancelled.current = true
    void api.query.cancel(runId.current).catch(() => undefined)
  }

  const hasGenerative = Boolean(generative)
  // Without either a collection module or a chosen provider, Weaviate has no
  // LLM to call and fails deep in the gRPC layer with "empty provider". Catch
  // it here instead, where we can say what to do about it.
  const hasProvider = hasGenerative || Boolean(provider)
  // Each retrieval kind needs its own query term before it can run.
  const hasQueryTerm =
    type === 'fetch' ||
    (TEXT_TYPES.includes(type) && Boolean(queryText.trim())) ||
    (type === 'nearVector' && Boolean(queryVector.trim())) ||
    (type === 'nearObject' && Boolean(queryObjectId.trim())) ||
    ((type === 'nearImage' || type === 'nearMedia') && Boolean(queryMedia))
  // Weaviate produces no per-object generation under groupBy and fails the whole
  // query with "No results for generative search" — only a grouped task works.
  const groupByConflict = Boolean(search.groupBy?.property) && Boolean(singlePrompt.trim())
  const canRun =
    hasProvider && (singlePrompt.trim() || groupedTask.trim()) && hasQueryTerm && !groupByConflict

  return (
    <Box p="md" style={{ height: '100%', overflow: 'auto' }}>
      {!hasGenerative && !provider && (
        <Alert color="yellow" icon={<IconAlertTriangle />} mb="md" title="No generative module">
          This collection has no generative module configured, so Weaviate has no LLM to call. Pick
          a provider under <b>2. Generate</b> to name one for this query, or add a module such as{' '}
          <Code>generative-openai</Code> to the collection config. Either way the provider&apos;s API
          key comes from a connection header, such as <Code>X-OpenAI-Api-Key</Code>.
        </Alert>
      )}

      <Paper withBorder p="md" mb="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={600} size="sm">
              1. Retrieve
            </Text>
            {generative && (
              <Badge variant="light" color="aqua">
                {generative}
              </Badge>
            )}
          </Group>
          <SegmentedControl
            data={RETRIEVAL_TYPES}
            value={type}
            onChange={(v) => setType(v as SearchType)}
          />
          {TEXT_TYPES.includes(type) && (
            <TextInput
              label="Search query"
              placeholder="what should the model read about?"
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
          {type === 'nearObject' && (
            <TextInput
              label="Source object UUID"
              description="Retrieves objects nearest to this one"
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
                <Select
                  label="Media kind"
                  data={MEDIA_KINDS}
                  value={mediaKind}
                  onChange={(v) => setMediaKind((v as NearMediaKind) ?? 'image')}
                />
              )}
            </Group>
          )}
          {type === 'hybrid' && (
            <div>
              <Text size="sm" fw={500}>
                Alpha: {alpha.toFixed(2)}
              </Text>
              <Slider min={0} max={1} step={0.05} value={alpha} onChange={setAlpha} />
            </div>
          )}
          <Group grow align="flex-start">
            <NumberInput
              label="Objects to retrieve"
              description="Each one costs tokens in a grouped task"
              min={1}
              max={50}
              value={limit}
              onChange={(v) => setLimit(Number(v))}
            />
            <MultiSelect
              label="Target vector"
              description={namedVectors.length ? 'Named vector' : 'No named vectors'}
              data={namedVectors}
              value={targetVector ? [targetVector] : []}
              maxValues={1}
              searchable
              clearable
              onChange={(v) => setTargetVector(v[0] ?? '')}
            />
            <MultiSelect
              label="Return properties"
              description="Empty returns every property"
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
                <Text size="sm">Advanced retrieval options</Text>
              </Accordion.Control>
              <Accordion.Panel>
                <AdvancedOptions
                  req={search}
                  patch={patchExtras}
                  properties={properties}
                  namedVectors={namedVectors}
                  hasReranker={hasReranker}
                />
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Divider my="xs" />

          <Text fw={600} size="sm">
            2. Generate
          </Text>
          {/* Both fields keep an identical single-line label and no description
              so their inputs sit on the same baseline; the Select's error text
              renders below the input and so cannot knock the row out of line. */}
          <Group grow align="flex-start">
            <Select
              label="Generative provider"
              data={[
                {
                  label: hasGenerative
                    ? `Collection default (${generative})`
                    : 'Collection default (none configured)',
                  value: COLLECTION_DEFAULT
                },
                ...PROVIDERS
              ]}
              value={provider}
              onChange={(v) => setProvider((v ?? COLLECTION_DEFAULT) as GenerativeProvider | '')}
              error={!hasProvider ? 'Pick a provider' : undefined}
            />
            <TextInput
              label="Model"
              placeholder="provider default"
              value={model}
              onChange={(e) => setModel(e.currentTarget.value)}
              disabled={!provider}
            />
          </Group>
          {provider && ENDPOINT_PROVIDERS.has(provider) && (
            <TextInput
              label="Endpoint"
              description="Reachable from the Weaviate server, not from this app"
              placeholder={provider === 'ollama' ? 'http://host.docker.internal:11434' : ''}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.currentTarget.value)}
            />
          )}
          {provider === 'azureOpenAI' && (
            <Group grow align="flex-start">
              <TextInput
                label="Resource name"
                value={resourceName}
                onChange={(e) => setResourceName(e.currentTarget.value)}
                error={!resourceName.trim() ? 'Required for Azure' : undefined}
              />
              <TextInput
                label="Deployment id"
                value={deploymentId}
                onChange={(e) => setDeploymentId(e.currentTarget.value)}
                error={!deploymentId.trim() ? 'Required for Azure' : undefined}
              />
              <TextInput
                label="API version"
                placeholder="module default"
                value={apiVersion}
                onChange={(e) => setApiVersion(e.currentTarget.value)}
              />
            </Group>
          )}
          {provider && (
            <Accordion variant="separated" chevronPosition="left">
              <Accordion.Item value="sampling">
                <Accordion.Control>
                  <Text size="sm">Sampling options</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="sm">
                    <Group grow align="flex-start">
                      <NumberInput
                        label="Temperature"
                        placeholder="provider default"
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={(v) => setTemperature(v === '' ? '' : Number(v))}
                      />
                      <NumberInput
                        label="Max tokens"
                        placeholder="provider default"
                        min={1}
                        value={maxTokens}
                        onChange={(v) => setMaxTokens(v === '' ? '' : Number(v))}
                      />
                      <NumberInput
                        label="Top P"
                        placeholder="provider default"
                        min={0}
                        max={1}
                        step={0.05}
                        value={topP}
                        onChange={(v) => setTopP(v === '' ? '' : Number(v))}
                      />
                    </Group>
                    <TextInput
                      label="Stop sequences"
                      description="Comma separated; ignored by providers that take none"
                      value={stop}
                      onChange={(e) => setStop(e.currentTarget.value)}
                    />
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}
          <Textarea
            label="Per-object prompt"
            description="Runs once per result. Use {propertyName} to inject that object's values."
            placeholder="Write a one-line summary of {title}."
            autosize
            minRows={2}
            value={singlePrompt}
            onChange={(e) => setSinglePrompt(e.currentTarget.value)}
            error={
              groupByConflict
                ? 'Weaviate cannot generate per object when grouping — use the grouped task, or clear groupBy under advanced retrieval options'
                : undefined
            }
          />
          <Textarea
            label="Grouped task"
            description="Runs once over every retrieved object together."
            placeholder="What themes do these documents have in common?"
            autosize
            minRows={2}
            value={groupedTask}
            onChange={(e) => setGroupedTask(e.currentTarget.value)}
          />
          <MultiSelect
            label="Context properties for the grouped task"
            description="Leave empty to send every property"
            data={properties}
            value={groupedProperties}
            onChange={setGroupedProperties}
            searchable
            clearable
            disabled={!groupedTask.trim()}
          />
          <MultiSelect
            label="Image properties"
            description="Blob properties sent to a multimodal model as images"
            data={properties}
            value={imageProperties}
            onChange={setImageProperties}
            searchable
            clearable
          />

          <Group justify="space-between">
            <Group gap="lg">
              <Switch
                label="Report token usage"
                checked={returnMetadata}
                onChange={(e) => setReturnMetadata(e.currentTarget.checked)}
              />
              <Switch
                label="Show resolved prompt"
                checked={debug}
                onChange={(e) => setDebug(e.currentTarget.checked)}
              />
            </Group>
          </Group>

          <Group justify="flex-end" gap="xs">
            {run.isPending && (
              <Button variant="light" color="gray" onClick={cancelRun}>
                Cancel
              </Button>
            )}
            <Button
              leftSection={<IconSparkles size={16} />}
              loading={run.isPending}
              disabled={!canRun}
              onClick={() => run.mutate()}
            >
              Generate
            </Button>
          </Group>
        </Stack>
      </Paper>

      {run.isPending && (
        <Center h={120}>
          <Loader />
        </Center>
      )}
      {run.isError && (
        <Alert color="red" icon={<IconAlertTriangle />} title="Generation failed">
          {run.error.message}
          {vectorizer?.toLowerCase() === 'none' && (
            <Text size="xs" mt="xs">
              This collection has no vectorizer, so Near text and Hybrid retrieval cannot embed the
              query. Try BM25 or Fetch instead.
            </Text>
          )}
        </Alert>
      )}

      {run.data && (
        <Stack gap="md">
          {run.data.generated && (
            <Paper withBorder p="md">
              <Group justify="space-between" mb="xs">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Grouped result
                </Text>
                <Group gap="xs">
                  <UsageBadge usage={run.data.usage} />
                  {run.data.took != null && (
                    <Text size="xs" c="dimmed">
                      {run.data.took} ms
                    </Text>
                  )}
                </Group>
              </Group>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{run.data.generated}</Text>
            </Paper>
          )}

          {run.data.groups?.map((g) => (
            <Paper key={g.name} withBorder p="sm">
              <Group gap="xs" mb={6}>
                <Badge variant="light">{g.name}</Badge>
                <Text size="xs" c="dimmed">
                  {g.numberOfObjects} objects
                </Text>
              </Group>
              {g.generated && <Text style={{ whiteSpace: 'pre-wrap' }}>{g.generated}</Text>}
            </Paper>
          ))}

          {run.data.objects.map((o) => (
            <Paper key={o.uuid} withBorder p="sm">
              <Group gap="xs" mb={6}>
                <Text size="xs" c="aqua.4" className="weft-mono" title={o.uuid}>
                  {o.uuid.slice(0, 8)}…
                </Text>
                <UsageBadge usage={o.usage} />
              </Group>
              {o.generated && (
                <Text mb="xs" style={{ whiteSpace: 'pre-wrap' }}>
                  {o.generated}
                </Text>
              )}
              {o.debugPrompt && (
                <Code block mb="xs" style={{ whiteSpace: 'pre-wrap' }}>
                  {o.debugPrompt}
                </Code>
              )}
              <Text size="xs" c="dimmed" className="weft-truncate">
                {JSON.stringify(o.properties)}
              </Text>
            </Paper>
          ))}

          {run.data.objects.length === 0 && !run.data.generated && (
            <Text c="dimmed">Retrieval returned nothing, so there was nothing to generate from.</Text>
          )}
        </Stack>
      )}
    </Box>
  )
}
