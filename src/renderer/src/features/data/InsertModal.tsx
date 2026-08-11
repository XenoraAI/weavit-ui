import { useState } from 'react'
import { Modal, Stack, TextInput, Textarea, Button, Group, Text, Collapse, Anchor } from '@mantine/core'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { CodeEditor } from '../../components/CodeEditor'

interface Props {
  connectionId: string
  collection: string
  tenant?: string
  onClose: () => void
  onInserted: () => void
}

export function InsertModal({ connectionId, collection, tenant, onClose, onInserted }: Props) {
  const [propsText, setPropsText] = useState('{\n  \n}')
  const [id, setId] = useState('')
  const [vectorText, setVectorText] = useState('')
  const [referencesText, setReferencesText] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)

  const insert = async () => {
    setBusy(true)
    try {
      const properties = JSON.parse(propsText)
      let vector: number[] | undefined
      let vectors: Record<string, number[]> | undefined
      if (vectorText.trim()) {
        const parsed = JSON.parse(vectorText)
        // A bare array is the default vector space; an object names each one.
        if (Array.isArray(parsed)) vector = parsed
        else if (parsed && typeof parsed === 'object') vectors = parsed
        else throw new Error('Vector must be a JSON array, or an object of named vectors')
      }
      let references: Record<string, string[]> | undefined
      if (referencesText.trim()) {
        const parsed = JSON.parse(referencesText)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('References must be an object of property → UUID array')
        }
        references = parsed
      }
      const res = await api.data.insert({
        connectionId,
        collection,
        properties,
        id: id.trim() || undefined,
        vector,
        vectors,
        references,
        tenant
      })
      notifyOk(`Inserted ${res.uuid}`)
      onInserted()
    } catch (e) {
      notifyErr(e, 'Insert failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened onClose={onClose} title={`Insert into ${collection}`} size="lg">
      <Stack>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Properties (JSON)
          </Text>
          <CodeEditor value={propsText} onChange={setPropsText} height="300px" />
        </div>

        <Anchor size="xs" onClick={() => setShowAdvanced((s) => !s)}>
          {showAdvanced ? 'Hide' : 'Show'} advanced (custom UUID, vectors, references)
        </Anchor>
        <Collapse in={showAdvanced}>
          <Stack gap="sm">
            <TextInput
              label="UUID (optional)"
              placeholder="auto-generated if empty"
              value={id}
              onChange={(e) => setId(e.currentTarget.value)}
            />
            <Textarea
              label="Vector (optional)"
              description='A JSON array for the default space, or {"name": [...]} for named vectors. Only for collections without a server-side vectorizer.'
              placeholder="[0.12, 0.98, …]"
              autosize
              minRows={2}
              value={vectorText}
              onChange={(e) => setVectorText(e.currentTarget.value)}
            />
            <Textarea
              label="References (optional)"
              description="Cross-references as property → array of target UUIDs"
              placeholder='{ "hasCategory": ["8f2c…"] }'
              autosize
              minRows={2}
              value={referencesText}
              onChange={(e) => setReferencesText(e.currentTarget.value)}
            />
          </Stack>
        </Collapse>

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={insert}>
            Insert
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
