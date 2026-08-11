import { useEffect, useState } from 'react'
import {
  Modal,
  Stack,
  Group,
  Tabs,
  TextInput,
  NumberInput,
  Select,
  Switch,
  Button,
  Text,
  Alert,
  Code,
  Divider,
  Loader,
  Center,
  Table,
  ScrollArea,
  MultiSelect
} from '@mantine/core'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { CodeEditor } from '../../components/CodeEditor'
import { FILTER_STRATEGIES } from './schemaOptions'
import { EMPTY_SETTINGS, buildPatch, readSettings, type Settings } from './collectionSettings'
import { PropertyFields } from './PropertyFields'
import { newPropertyDraft, toPropertyDefinition, type PropertyDraft } from './propertyDraft'

export type EditTab = 'settings' | 'property' | 'reference' | 'vector' | 'advanced'

interface Props {
  opened: boolean
  connectionId: string
  collection: string
  /** Which tab to open on; lets callers deep-link "Add property". */
  initialTab?: EditTab
  onClose: () => void
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function EditCollectionModal({
  opened,
  connectionId,
  collection,
  initialTab = 'settings',
  onClose
}: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<EditTab>(initialTab)
  const [initial, setInitial] = useState<Settings>(EMPTY_SETTINGS)
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS)
  const [rawText, setRawText] = useState('')
  const [busy, setBusy] = useState(false)

  const [draft, setDraft] = useState<PropertyDraft>(newPropertyDraft())

  // Reference draft
  const [refName, setRefName] = useState('')
  const [refTargets, setRefTargets] = useState<string[]>([])
  const [refDescription, setRefDescription] = useState('')

  // Named-vector draft
  const [vecName, setVecName] = useState('')
  const [vecVectorizer, setVecVectorizer] = useState<string | null>('none')
  const [vecSourceProps, setVecSourceProps] = useState<string[]>([])

  const schema = useQuery({
    queryKey: ['collectionSchema', connectionId, collection],
    queryFn: () => api.schema.getCollectionSchema(connectionId, collection),
    enabled: opened
  })

  const collections = useQuery({
    queryKey: ['collections', connectionId],
    queryFn: () => api.schema.listCollections(connectionId),
    enabled: opened
  })

  useEffect(() => setTab(initialTab), [initialTab, opened])

  useEffect(() => {
    if (!schema.data) return
    const s = readSettings(schema.data)
    setInitial(s)
    setSettings(s)
    setRawText(JSON.stringify(schema.data, null, 2))
  }, [schema.data])

  const cls = schema.data as any
  const mtEnabled = Boolean(cls?.multiTenancyConfig?.enabled)
  const hasVectorIndexConfig = Boolean(cls?.vectorIndexConfig)
  const existingProps: any[] = Array.isArray(cls?.properties) ? cls.properties : []
  const duplicate = existingProps.some(
    (p) => String(p?.name ?? '').toLowerCase() === draft.name.trim().toLowerCase()
  )
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['collection', connectionId, collection] })
    qc.invalidateQueries({ queryKey: ['collectionSchema', connectionId, collection] })
    qc.invalidateQueries({ queryKey: ['collections', connectionId] })
  }

  const saveSettings = async () => {
    const patch = buildPatch(initial, settings)
    if (!Object.keys(patch).length) {
      notifyOk('No changes to save')
      return
    }
    setBusy(true)
    try {
      await api.schema.updateCollection(connectionId, collection, patch)
      notifyOk(`Updated ${collection}`)
      invalidate()
      onClose()
    } catch (e) {
      notifyErr(e, 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const saveRaw = async () => {
    setBusy(true)
    try {
      const parsed = JSON.parse(rawText)
      // Send as-is: the editor holds the whole class, so a key deleted here
      // should actually be dropped rather than merged back in.
      await api.schema.updateCollection(connectionId, collection, parsed, true)
      notifyOk(`Updated ${collection}`)
      invalidate()
      onClose()
    } catch (e) {
      notifyErr(e, 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const addProperty = async () => {
    const propertyName = draft.name.trim()
    if (!propertyName || duplicate) return
    setBusy(true)
    try {
      await api.schema.addProperty(connectionId, collection, toPropertyDefinition(draft))
      notifyOk(`Added property ${propertyName}`)
      setDraft(newPropertyDraft())
      invalidate()
    } catch (e) {
      notifyErr(e, 'Add property failed')
    } finally {
      setBusy(false)
    }
  }

  const addReference = async () => {
    const name = refName.trim()
    if (!name || refTargets.length === 0) return
    setBusy(true)
    try {
      // Single- and multi-target references take different shapes: one target
      // collection versus a list of them.
      const definition =
        refTargets.length === 1
          ? { name, targetCollection: refTargets[0], description: refDescription || undefined }
          : { name, targetCollections: refTargets, description: refDescription || undefined }
      await api.schema.addReference(connectionId, collection, definition)
      notifyOk(`Added reference ${name}`)
      setRefName('')
      setRefTargets([])
      setRefDescription('')
      invalidate()
    } catch (e) {
      notifyErr(e, 'Add reference failed')
    } finally {
      setBusy(false)
    }
  }

  const addVector = async () => {
    const name = vecName.trim()
    if (!name) return
    setBusy(true)
    try {
      const vectorizer = vecVectorizer ?? 'none'
      await api.schema.addVector(connectionId, collection, {
        [name]: {
          vectorizer: {
            name: vectorizer,
            config:
              vectorizer === 'none' || vecSourceProps.length === 0
                ? {}
                : { sourceProperties: vecSourceProps }
          }
        }
      })
      notifyOk(`Added named vector ${name}`)
      setVecName('')
      setVecSourceProps([])
      invalidate()
    } catch (e) {
      notifyErr(e, 'Add named vector failed')
    } finally {
      setBusy(false)
    }
  }

  const otherCollections = (collections.data ?? [])
    .map((c) => c.name)
    .filter((n) => n !== collection)
  const propertyNames = existingProps.map((p) => String(p?.name ?? '')).filter(Boolean)
  const existingVectorNames = Object.keys(cls?.vectorConfig ?? {})
  const vectorDuplicate = existingVectorNames.some(
    (n) => n.toLowerCase() === vecName.trim().toLowerCase()
  )

  return (
    <Modal opened={opened} onClose={onClose} title={`Edit ${collection}`} size="lg">
      {schema.isLoading ? (
        <Center h={200}>
          <Loader />
        </Center>
      ) : schema.isError ? (
        <Alert color="red" icon={<IconAlertTriangle />} title="Failed to load schema">
          {(schema.error as Error).message}
        </Alert>
      ) : (
        <Tabs value={tab} onChange={(v) => setTab((v as EditTab) ?? 'settings')}>
          <Tabs.List mb="md">
            <Tabs.Tab value="settings">Settings</Tabs.Tab>
            <Tabs.Tab value="property">Add property</Tabs.Tab>
            <Tabs.Tab value="reference">Add reference</Tabs.Tab>
            <Tabs.Tab value="vector">Add vector</Tabs.Tab>
            <Tabs.Tab value="advanced">Advanced (JSON)</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="settings">
            <Stack>
              <Alert color="gray" icon={<IconInfoCircle />} p="xs">
                <Text size="xs">
                  Name, vectorizer, vector index type, multi-tenancy on/off and existing property
                  definitions are immutable in Weaviate — recreate the collection to change them.
                </Text>
              </Alert>

              <TextInput
                label="Description"
                value={settings.description}
                onChange={(e) => set({ description: e.currentTarget.value })}
              />

              <Divider label="Inverted index (BM25)" labelPosition="left" />
              <Group grow>
                <NumberInput
                  label="b"
                  description="0–1, length normalization"
                  min={0}
                  max={1}
                  step={0.05}
                  decimalScale={2}
                  value={settings.bm25b}
                  onChange={(v) => set({ bm25b: v === '' ? '' : Number(v) })}
                />
                <NumberInput
                  label="k1"
                  description="term frequency saturation"
                  min={0}
                  step={0.1}
                  decimalScale={2}
                  value={settings.bm25k1}
                  onChange={(v) => set({ bm25k1: v === '' ? '' : Number(v) })}
                />
                <NumberInput
                  label="Cleanup interval (s)"
                  min={0}
                  value={settings.cleanupIntervalSeconds}
                  onChange={(v) => set({ cleanupIntervalSeconds: v === '' ? '' : Number(v) })}
                />
              </Group>

              {hasVectorIndexConfig && (
                <>
                  <Divider label="Vector index" labelPosition="left" />
                  <Group grow>
                    <NumberInput
                      label="ef"
                      description="-1 = dynamic"
                      value={settings.ef}
                      onChange={(v) => set({ ef: v === '' ? '' : Number(v) })}
                    />
                    <NumberInput
                      label="dynamicEfMin"
                      min={0}
                      value={settings.dynamicEfMin}
                      onChange={(v) => set({ dynamicEfMin: v === '' ? '' : Number(v) })}
                    />
                    <NumberInput
                      label="dynamicEfMax"
                      min={0}
                      value={settings.dynamicEfMax}
                      onChange={(v) => set({ dynamicEfMax: v === '' ? '' : Number(v) })}
                    />
                  </Group>
                  <Group grow>
                    <NumberInput
                      label="dynamicEfFactor"
                      min={0}
                      value={settings.dynamicEfFactor}
                      onChange={(v) => set({ dynamicEfFactor: v === '' ? '' : Number(v) })}
                    />
                    <NumberInput
                      label="flatSearchCutoff"
                      min={0}
                      value={settings.flatSearchCutoff}
                      onChange={(v) => set({ flatSearchCutoff: v === '' ? '' : Number(v) })}
                    />
                    <NumberInput
                      label="vectorCacheMaxObjects"
                      min={0}
                      value={settings.vectorCacheMaxObjects}
                      onChange={(v) => set({ vectorCacheMaxObjects: v === '' ? '' : Number(v) })}
                    />
                  </Group>
                  <Select
                    label="Filter strategy"
                    description="acorn requires Weaviate 1.27+"
                    data={FILTER_STRATEGIES}
                    value={settings.filterStrategy || null}
                    onChange={(v) => set({ filterStrategy: v ?? '' })}
                    clearable
                  />
                </>
              )}

              {mtEnabled && (
                <>
                  <Divider label="Multi-tenancy" labelPosition="left" />
                  <Group>
                    <Switch
                      label="Auto tenant creation"
                      checked={settings.autoTenantCreation}
                      onChange={(e) => set({ autoTenantCreation: e.currentTarget.checked })}
                    />
                    <Switch
                      label="Auto tenant activation"
                      checked={settings.autoTenantActivation}
                      onChange={(e) => set({ autoTenantActivation: e.currentTarget.checked })}
                    />
                  </Group>
                </>
              )}

              <Group justify="flex-end" mt="sm">
                <Button variant="default" onClick={onClose}>
                  Cancel
                </Button>
                <Button loading={busy} onClick={saveSettings}>
                  Save changes
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="property">
            <Stack>
              <Alert color="yellow" icon={<IconAlertTriangle />} p="xs">
                <Text size="xs">
                  Properties can be added but never renamed or removed. Objects imported before a
                  new property is added are not re-indexed for it.
                </Text>
              </Alert>

              <div>
                <Text size="sm" fw={500} mb={4}>
                  Existing properties{' '}
                  <Text span size="xs" c="dimmed">
                    ({existingProps.length})
                  </Text>
                </Text>
                {existingProps.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    This collection has no properties yet.
                  </Text>
                ) : (
                  <ScrollArea.Autosize mah={180}>
                    <Table withTableBorder striped stickyHeader style={{ fontSize: 12.5 }}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Name</Table.Th>
                          <Table.Th>Data type</Table.Th>
                          <Table.Th>Tokenization</Table.Th>
                          <Table.Th>Filterable</Table.Th>
                          <Table.Th>Searchable</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {existingProps.map((p) => (
                          <Table.Tr key={p.name}>
                            <Table.Td>{p.name}</Table.Td>
                            <Table.Td>
                              <Code>
                                {(Array.isArray(p.dataType) ? p.dataType : [p.dataType]).join(', ')}
                              </Code>
                            </Table.Td>
                            <Table.Td>{p.tokenization ?? '—'}</Table.Td>
                            <Table.Td>{p.indexFilterable ? '✓' : '—'}</Table.Td>
                            <Table.Td>{p.indexSearchable ? '✓' : '—'}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea.Autosize>
                )}
              </div>

              <Divider label="New property" labelPosition="left" />

              <PropertyFields
                value={draft}
                onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                nameError={duplicate ? 'A property with this name already exists' : undefined}
              />

              <Group justify="flex-end" mt="sm">
                <Button variant="default" onClick={onClose}>
                  Close
                </Button>
                <Button
                  loading={busy}
                  disabled={!draft.name.trim() || duplicate}
                  onClick={addProperty}
                >
                  Add property
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="reference">
            <Stack>
              <Alert color="gray" icon={<IconInfoCircle />} p="xs">
                <Text size="xs">
                  A reference property links objects here to objects in another collection. Pick more
                  than one target to make it a multi-target reference — those need the target
                  collection named on every read and write.
                </Text>
              </Alert>
              <TextInput
                label="Reference name"
                placeholder="hasCategory"
                value={refName}
                onChange={(e) => setRefName(e.currentTarget.value)}
              />
              <MultiSelect
                label="Target collections"
                placeholder="Pick one or more"
                searchable
                data={otherCollections}
                value={refTargets}
                onChange={setRefTargets}
              />
              <TextInput
                label="Description (optional)"
                value={refDescription}
                onChange={(e) => setRefDescription(e.currentTarget.value)}
              />
              <Group justify="flex-end" mt="sm">
                <Button variant="default" onClick={onClose}>
                  Close
                </Button>
                <Button
                  loading={busy}
                  disabled={!refName.trim() || refTargets.length === 0}
                  onClick={addReference}
                >
                  Add reference
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="vector">
            <Stack>
              <Alert color="yellow" icon={<IconAlertTriangle />} p="xs">
                <Text size="xs">
                  Named vectors can only be added to a collection that already uses them. Existing
                  vector spaces are immutable, and adding one does not vectorize existing objects —
                  they need to be rewritten to gain the new embedding.
                </Text>
              </Alert>
              {existingVectorNames.length > 0 && (
                <Text size="xs" c="dimmed">
                  Existing: {existingVectorNames.join(', ')}
                </Text>
              )}
              <TextInput
                label="Vector name"
                placeholder="title_embedding"
                value={vecName}
                error={vectorDuplicate ? 'A vector with this name already exists' : undefined}
                onChange={(e) => setVecName(e.currentTarget.value)}
              />
              <Select
                label="Vectorizer"
                description="'none' means you supply the vector yourself on every write"
                data={[
                  'none',
                  'text2vec-openai',
                  'text2vec-cohere',
                  'text2vec-huggingface',
                  'text2vec-ollama',
                  'text2vec-transformers',
                  'text2vec-google',
                  'text2vec-weaviate'
                ]}
                value={vecVectorizer}
                onChange={setVecVectorizer}
              />
              <MultiSelect
                label="Source properties"
                description="Which properties get embedded. Empty means all of them."
                data={propertyNames}
                value={vecSourceProps}
                onChange={setVecSourceProps}
                searchable
                clearable
                disabled={vecVectorizer === 'none'}
              />
              <Group justify="flex-end" mt="sm">
                <Button variant="default" onClick={onClose}>
                  Close
                </Button>
                <Button
                  loading={busy}
                  disabled={!vecName.trim() || vectorDuplicate}
                  onClick={addVector}
                >
                  Add named vector
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="advanced">
            <Stack>
              <Text size="xs" c="dimmed">
                The class definition as <Code>PUT /v1/schema/{collection}</Code> expects it. Edits to
                immutable fields are rejected by Weaviate.
              </Text>
              <CodeEditor value={rawText} onChange={setRawText} height="360px" />
              <Group justify="flex-end">
                <Button variant="default" onClick={onClose}>
                  Cancel
                </Button>
                <Button loading={busy} onClick={saveRaw}>
                  Save JSON
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      )}
    </Modal>
  )
}
