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
  Divider
} from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { CodeEditor } from '../../components/CodeEditor'

interface Props {
  opened: boolean
  connectionId: string
  onClose: () => void
}

interface PropRow {
  name: string
  dataType: string
}

const DATA_TYPES = ['text', 'text[]', 'int', 'int[]', 'number', 'number[]', 'boolean', 'date', 'uuid', 'object']

const VECTORIZERS = [
  'none',
  'text2vec-openai',
  'text2vec-cohere',
  'text2vec-huggingface',
  'text2vec-ollama',
  'text2vec-contextionary'
]

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
  const [props, setProps] = useState<PropRow[]>([{ name: '', dataType: 'text' }])
  const [rawText, setRawText] = useState(TEMPLATE)
  const [busy, setBusy] = useState(false)

  const setProp = (i: number, patch: Partial<PropRow>) =>
    setProps((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const buildDefinition = () => {
    if (mode === 'advanced') return JSON.parse(rawText)
    if (!name.trim()) throw new Error('Collection name is required')
    return {
      class: name.trim(),
      description: description.trim() || undefined,
      vectorizer,
      properties: props
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), dataType: [p.dataType] })),
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
            <Stack gap="xs">
              {props.map((p, i) => (
                <Group key={i} gap="xs" wrap="nowrap">
                  <TextInput
                    placeholder="property name"
                    value={p.name}
                    onChange={(e) => setProp(i, { name: e.currentTarget.value })}
                    style={{ flex: 1 }}
                  />
                  <Select
                    data={DATA_TYPES}
                    value={p.dataType}
                    onChange={(v) => setProp(i, { dataType: v ?? 'text' })}
                    w={130}
                  />
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() => setProps((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <IconTrash size={15} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                size="compact-xs"
                variant="light"
                leftSection={<IconPlus size={13} />}
                onClick={() => setProps((p) => [...p, { name: '', dataType: 'text' }])}
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
          <Button loading={busy} onClick={save}>
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
