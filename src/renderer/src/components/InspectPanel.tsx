import { useState, type ReactNode } from 'react'
import { Group, SegmentedControl, ActionIcon, Tooltip, Stack } from '@mantine/core'
import { IconDownload } from '@tabler/icons-react'
import { JsonView } from './JsonView'
import { downloadText } from '../lib/exportFile'
import { notifyOk } from '../lib/notify'

interface Props {
  /** Base filename for the download, without the .json extension. */
  name: string
  /** The value shown in the JSON view and written to the file. */
  value: unknown
  /** The rendered, human-readable version of the same data. */
  children: ReactNode
  maxHeight?: number
  /** Extra controls to sit alongside the view toggle. */
  actions?: ReactNode
}

/**
 * Pairs a readable rendering of some server response with the raw JSON behind
 * it. The visual is what you read; the JSON is what you copy into a ticket or
 * hand to a script, so it is always one click away and downloadable as a file.
 */
export function InspectPanel({ name, value, children, maxHeight = 460, actions }: Props) {
  const [view, setView] = useState<'visual' | 'json'>('visual')

  const download = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadText(`${name}-${stamp}.json`, JSON.stringify(value, null, 2), 'application/json')
    notifyOk(`Saved ${name}-${stamp}.json`)
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <SegmentedControl
          size="xs"
          data={[
            { value: 'visual', label: 'Visual' },
            { value: 'json', label: 'JSON' }
          ]}
          value={view}
          onChange={(v) => setView(v as 'visual' | 'json')}
        />
        <Group gap="xs">
          {actions}
          <Tooltip label="Download as JSON file">
            <ActionIcon variant="light" onClick={download}>
              <IconDownload size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {view === 'visual' ? children : <JsonView value={value} maxHeight={maxHeight} />}
    </Stack>
  )
}
