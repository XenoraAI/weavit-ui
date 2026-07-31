import { useState } from 'react'
import {
  Drawer,
  Tabs,
  Group,
  Button,
  Text,
  Table,
  Stack,
  CopyButton,
  ActionIcon,
  Tooltip,
  Switch,
  Modal,
  Alert,
  Code,
  Divider
} from '@mantine/core'
import {
  IconEdit,
  IconTrash,
  IconDeviceFloppy,
  IconX,
  IconCopy,
  IconCheck,
  IconAlertTriangle
} from '@tabler/icons-react'
import type { WeaviateObject } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { JsonView } from '../../components/JsonView'
import { VectorView } from '../../components/VectorView'
import { CodeEditor } from '../../components/CodeEditor'

interface Props {
  connectionId: string
  collection: string
  tenant?: string
  object: WeaviateObject
  onClose: () => void
  onChanged: () => void
}

function valueText(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function ObjectDrawer({ connectionId, collection, tenant, object, onClose, onChanged }: Props) {
  const [editing, setEditing] = useState(false)
  const [propsText, setPropsText] = useState('')
  const [merge, setMerge] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const startEdit = () => {
    setPropsText(JSON.stringify(object.properties, null, 2))
    setEditing(true)
  }

  const save = async () => {
    setBusy(true)
    try {
      const properties = JSON.parse(propsText)
      await api.data.update({ connectionId, collection, id: object.uuid, properties, tenant, merge })
      notifyOk('Object updated')
      onChanged()
    } catch (e) {
      notifyErr(e, 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    setBusy(true)
    try {
      await api.data.delete({ connectionId, collection, id: object.uuid, tenant })
      notifyOk('Object deleted')
      onChanged()
    } catch (e) {
      notifyErr(e, 'Delete failed')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size="lg"
      title={
        <Group gap="xs">
          <Text fw={700}>Object</Text>
          <Code>{object.uuid}</Code>
          <CopyButton value={object.uuid}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy UUID'}>
                <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      }
    >
      <Group mb="sm" justify="space-between">
        {!editing ? (
          <Group gap="xs">
            <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={startEdit}>
              Edit
            </Button>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </Group>
        ) : (
          <Group gap="xs">
            <Button
              size="xs"
              leftSection={<IconDeviceFloppy size={14} />}
              loading={busy}
              onClick={save}
            >
              Save
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconX size={14} />}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Switch
              size="xs"
              label={merge ? 'Merge' : 'Replace'}
              checked={merge}
              onChange={(e) => setMerge(e.currentTarget.checked)}
            />
          </Group>
        )}
      </Group>

      {editing ? (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            Edit properties as JSON. “Merge” patches only these fields; “Replace” overwrites the whole
            object.
          </Text>
          <CodeEditor value={propsText} onChange={setPropsText} height="55vh" />
        </Stack>
      ) : (
        <Tabs defaultValue="structured">
          <Tabs.List mb="sm">
            <Tabs.Tab value="structured">Properties</Tabs.Tab>
            <Tabs.Tab value="json">JSON</Tabs.Tab>
            <Tabs.Tab value="vectors">Vectors</Tabs.Tab>
            <Tabs.Tab value="metadata">Metadata</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="structured">
            <Table withRowBorders={false} verticalSpacing={6}>
              <Table.Tbody>
                {Object.entries(object.properties).map(([k, v]) => (
                  <Table.Tr key={k}>
                    <Table.Td style={{ width: 160, verticalAlign: 'top' }}>
                      <Text size="sm" fw={600} c="aqua.4">
                        {k}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" style={{ wordBreak: 'break-word' }}>
                        {valueText(v)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>

          <Tabs.Panel value="json">
            <JsonView value={{ uuid: object.uuid, properties: object.properties }} maxHeight={520} />
          </Tabs.Panel>

          <Tabs.Panel value="vectors">
            <VectorView vectors={object.vectors} />
          </Tabs.Panel>

          <Tabs.Panel value="metadata">
            <JsonView value={object.metadata ?? {}} maxHeight={520} />
          </Tabs.Panel>
        </Tabs>
      )}

      <Modal
        opened={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete object"
        centered
      >
        <Alert color="red" icon={<IconAlertTriangle />} mb="md">
          This permanently deletes object <Code>{object.uuid}</Code>. This cannot be undone.
        </Alert>
        <Divider mb="md" />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button color="red" loading={busy} onClick={doDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
    </Drawer>
  )
}
