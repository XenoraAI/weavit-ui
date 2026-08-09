import { useState } from 'react'
import { Modal, Alert, Code, TextInput, Group, Button } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { useApp } from '../../store'

interface Props {
  opened: boolean
  connectionId: string
  collection: string
  onClose: () => void
}

/** Type-to-confirm delete, shared by the sidebar menu and the schema danger zone. */
export function DeleteCollectionModal({ opened, connectionId, collection, onClose }: Props) {
  const qc = useQueryClient()
  const selectCollection = useApp((s) => s.selectCollection)
  const selectedCollection = useApp((s) => s.selectedCollection)
  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setConfirmName('')
    onClose()
  }

  const doDelete = async () => {
    setBusy(true)
    try {
      await api.schema.deleteCollection(connectionId, collection)
      notifyOk(`Deleted collection ${collection}`)
      qc.invalidateQueries({ queryKey: ['collections', connectionId] })
      qc.removeQueries({ queryKey: ['collection', connectionId, collection] })
      // Only clear the selection if we just deleted what's on screen.
      if (selectedCollection === collection) selectCollection(undefined)
      close()
    } catch (e) {
      notifyErr(e, 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened={opened} onClose={close} title="Delete collection" centered>
      <Alert color="red" icon={<IconAlertTriangle />} mb="md">
        This permanently deletes <Code>{collection}</Code> and every object in it.
      </Alert>
      <TextInput
        label={`Type "${collection}" to confirm`}
        value={confirmName}
        onChange={(e) => setConfirmName(e.currentTarget.value)}
        mb="md"
        data-autofocus
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={close}>
          Cancel
        </Button>
        <Button color="red" disabled={confirmName !== collection} loading={busy} onClick={doDelete}>
          Delete
        </Button>
      </Group>
    </Modal>
  )
}
