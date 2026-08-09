import { useState } from 'react'
import {
  Modal,
  Stack,
  TextInput,
  Select,
  Switch,
  Button,
  Group,
  ActionIcon,
  Text,
  SegmentedControl,
  Divider,
  Card
} from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { CodeEditor } from '../../components/CodeEditor'
import { VECTORIZERS } from './schemaOptions'
import { PropertyFields } from './PropertyFields'
import {
  duplicateNames,
  newPropertyDraft,
  toPropertyDefinition,
  type PropertyDraft
} from './propertyDraft'

interface Props {
  opened: boolean
  connectionId: string
  onClose: () => void
}

const TEMPLATE = `{
  "class": "Article",
  "description": "",
  "vectorizer": "none",
  "properties": [
    { "name": "title", "dataType": ["text"] },
    { "name": "wordCount", "dataType": ["int"] }
  ],
  "multiTenancyConfig": { "enabled": false }
}`

export function CreateCollectionModal({ opened, connectionId, onClose }: Props) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'guided' | 'advanced'>('guided')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [vectorizer, setVectorizer] = useState('none')
  const [multiTenancy, setMultiTenancy] = useState(false)
  const [props, setProps] = useState<PropertyDraft[]>([newPropertyDraft()])
  const [rawText, setRawText] = useState(TEMPLATE)
  const [busy, setBusy] = useState(false)

  const setProp = (i: number, patch: Partial<PropertyDraft>) =>
    setProps((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const dupes = duplicateNames(props.map((p) => p.name))
  const isDupe = (p: PropertyDraft) => dupes.has(p.name.trim().toLowerCase())
  const guidedInvalid = mode === 'guided' && (!name.trim() || dupes.size > 0)

  const buildDefinition = () => {
    if (mode === 'advanced') return JSON.parse(rawText)
    if (!name.trim()) throw new Error('Collection name is required')
    return {
      class: name.trim(),
      description: description.trim() || undefined,
      vectorizer,
      properties: props.filter((p) => p.name.trim()).map(toPropertyDefinition),
      multiTenancyConfig: { enabled: multiTenancy }
    }
  }

  const save = async () => {
    setBusy(true)
    try {
      const definition = buildDefinition()
      await api.schema.createCollection(connectionId, definition)
      notifyOk('Collection created')
      qc.invalidateQueries({ queryKey: ['collections', connectionId] })
      onClose()
    } catch (e) {
      notifyErr(e, 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="New collection" size="lg">
      <Stack>
        <SegmentedControl
          value={mode}
          onChange={(v) => setMode(v as 'guided' | 'advanced')}
          data={[
            { label: 'Guided', value: 'guided' },
            { label: 'Advanced (JSON)', value: 'advanced' }
          ]}
        />

        {mode === 'guided' ? (
          <>
            <TextInput
              label="Name"
              placeholder="Article"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              data-autofocus
            />
            <TextInput
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
            <Group grow>
              <Select label="Vectorizer" data={VECTORIZERS} value={vectorizer} onChange={(v) => setVectorizer(v ?? 'none')} />
              <Switch
                label="Multi-tenancy"
                checked={multiTenancy}
                onChange={(e) => setMultiTenancy(e.currentTarget.checked)}
                mt={24}
              />
            </Group>

            <Divider label="Properties" labelPosition="left" />
            <Stack gap="sm">
              {props.map((p, i) => (
                <Card key={i} withBorder padding="sm">
                  <Group justify="space-between" mb="xs">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      Property {i + 1}
                    </Text>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      aria-label={`Remove property ${i + 1}`}
                      onClick={() => setProps((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <IconTrash size={15} />
                    </ActionIcon>
                  </Group>
                  <PropertyFields
                    value={p}
                    onChange={(patch) => setProp(i, patch)}
                    nameError={isDupe(p) ? 'Duplicate property name' : undefined}
                  />
                </Card>
              ))}
              <Button
                size="compact-sm"
                variant="light"
                leftSection={<IconPlus size={13} />}
                onClick={() => setProps((p) => [...p, newPropertyDraft()])}
                style={{ alignSelf: 'flex-start' }}
              >
                Add property
              </Button>
            </Stack>
            {vectorizer !== 'none' && (
              <Text size="xs" c="dimmed">
                Note: module vectorizers may need an API key set as an extra header on the connection
                (e.g. X-OpenAI-Api-Key).
              </Text>
            )}
          </>
        ) : (
          <div>
            <Text size="sm" fw={500} mb={4}>
              Class definition (Weaviate schema JSON)
            </Text>
            <CodeEditor value={rawText} onChange={setRawText} height="320px" />
          </div>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={guidedInvalid} onClick={save}>
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
