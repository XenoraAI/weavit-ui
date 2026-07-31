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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)

  const insert = async () => {
    setBusy(true)
    try {
      const properties = JSON.parse(propsText)
      let vector: number[] | undefined
      if (vectorText.trim()) {
        vector = JSON.parse(vectorText)
        if (!Array.isArray(vector)) throw new Error('Vector must be a JSON array of numbers')
      }
      const res = await api.data.insert({
        connectionId,
        collection,
        properties,
        id: id.trim() || undefined,
        vector,
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
          {showAdvanced ? 'Hide' : 'Show'} advanced (custom UUID, bring-your-own vector)
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
              label="Vector (optional JSON array)"
              description="Only for collections without a server-side vectorizer"
              placeholder="[0.12, 0.98, …]"
              autosize
              minRows={2}
              value={vectorText}
              onChange={(e) => setVectorText(e.currentTarget.value)}
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
