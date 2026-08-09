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
  ScrollArea
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

export type EditTab = 'settings' | 'property' | 'advanced'

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

  const schema = useQuery({
    queryKey: ['collectionSchema', connectionId, collection],
    queryFn: () => api.schema.getCollectionSchema(connectionId, collection),
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
