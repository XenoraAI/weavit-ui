import { useState } from 'react'
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  Alert,
  NumberInput,
  Table,
  Code,
  Badge,
  Progress,
  ScrollArea,
  SegmentedControl
} from '@mantine/core'
import { IconUpload, IconAlertTriangle, IconCheck } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import type { ImportObject, ImportResult } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { pickTextFile } from '../../lib/exportFile'
import { parseImport, type ImportFormat } from './importParsing'

interface Props {
  connectionId: string
  collection: string
  tenant?: string
  onClose: () => void
  onImported: () => void
}

export function ImportModal({ connectionId, collection, tenant, onClose, onImported }: Props) {
  const [format, setFormat] = useState<ImportFormat>('json')
  const [fileName, setFileName] = useState('')
  const [objects, setObjects] = useState<ImportObject[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [batchSize, setBatchSize] = useState(100)
  const [result, setResult] = useState<ImportResult | null>(null)

  const choose = async () => {
    const accept =
      format === 'csv' ? '.csv,text/csv' : format === 'jsonl' ? '.jsonl,.ndjson' : '.json'
    const file = await pickTextFile(accept)
    if (!file) return
    setFileName(file.name)
    setResult(null)
    try {
      const parsed = parseImport(file.text, format)
      if (parsed.length === 0) throw new Error('No rows found in the file')
      setObjects(parsed)
      setParseError(null)
    } catch (e) {
      setObjects([])
      setParseError(e instanceof Error ? e.message : String(e))
    }
  }

  const run = useMutation<ImportResult, Error>({
    mutationFn: () =>
      api.data.importObjects({ connectionId, collection, tenant, objects, batchSize }),
    onSuccess: (r) => {
      setResult(r)
      if (r.failed === 0) {
        notifyOk(`Imported ${r.inserted} objects`)
        onImported()
      }
    },
    onError: (e) => notifyErr(e, 'Import failed')
  })

  const preview = objects.slice(0, 5)
  const previewColumns = [...new Set(preview.flatMap((o) => Object.keys(o.properties)))].slice(0, 6)

  return (
    <Modal opened onClose={onClose} title={`Import into ${collection}`} size="lg" centered>
      <Stack gap="sm">
        <SegmentedControl
          size="xs"
          data={[
            { value: 'json', label: 'JSON array' },
            { value: 'jsonl', label: 'JSONL' },
            { value: 'csv', label: 'CSV' }
          ]}
          value={format}
          onChange={(v) => {
            setFormat(v as ImportFormat)
            setObjects([])
            setFileName('')
            setParseError(null)
            setResult(null)
          }}
        />

        <Text size="xs" c="dimmed">
          {format === 'csv'
            ? 'The header row names the properties. An _id or id column is used as the object UUID.'
            : 'Rows may be bare property objects, or {"properties": {…}, "id": "…"} as produced by Export.'}
        </Text>

        <Button variant="light" leftSection={<IconUpload size={15} />} onClick={choose}>
          {fileName || 'Choose a file'}
        </Button>

        {parseError && (
          <Alert color="red" icon={<IconAlertTriangle />} title="Could not read the file">
            {parseError}
          </Alert>
        )}

        {objects.length > 0 && (
          <>
            <Group gap="xs">
              <Badge variant="light">{objects.length} rows</Badge>
              <Text size="xs" c="dimmed">
                showing the first {preview.length}
              </Text>
            </Group>
            <ScrollArea.Autosize mah={200}>
              <Table withTableBorder className="weft-mono" style={{ fontSize: 11.5 }}>
                <Table.Thead>
                  <Table.Tr>
                    {previewColumns.map((c) => (
                      <Table.Th key={c}>{c}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.map((o, i) => (
                    <Table.Tr key={i}>
                      {previewColumns.map((c) => (
                        <Table.Td key={c}>
                          <div className="weft-truncate">
                            {o.properties[c] === undefined
                              ? ''
                              : typeof o.properties[c] === 'object'
                                ? JSON.stringify(o.properties[c])
                                : String(o.properties[c])}
                          </div>
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>

            <NumberInput
              size="xs"
              label="Batch size"
              description="Rows per request. Lower it if the server times out."
              min={1}
              max={1000}
              value={batchSize}
              onChange={(v) => setBatchSize(Number(v))}
            />
          </>
        )}

        {run.isPending && <Progress value={100} animated />}

        {result && (
          <Alert
            color={result.failed === 0 ? 'teal' : 'orange'}
            icon={result.failed === 0 ? <IconCheck /> : <IconAlertTriangle />}
            title={`${result.inserted} inserted, ${result.failed} failed`}
          >
            {result.errors.length > 0 && (
              <ScrollArea.Autosize mah={160} mt="xs">
                <Stack gap={2}>
                  {result.errors.slice(0, 50).map((e) => (
                    <Text key={e.index} size="xs">
                      <Code>row {e.index + 1}</Code> {e.message}
                    </Text>
                  ))}
                  {result.errors.length > 50 && (
                    <Text size="xs" c="dimmed">
                      …and {result.errors.length - 50} more
                    </Text>
                  )}
                </Stack>
              </ScrollArea.Autosize>
            )}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button
            disabled={objects.length === 0}
            loading={run.isPending}
            onClick={() => run.mutate()}
          >
            Import {objects.length || ''}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
