import { useState } from 'react'
import { Modal, SegmentedControl, Stack, Group, CopyButton, Button, Code } from '@mantine/core'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import type { SearchRequest } from '@shared/types'
import { generateCode, type CodeLanguage } from './codegen'

interface Props {
  request: SearchRequest
  onClose: () => void
}

const LANGUAGES: { value: CodeLanguage; label: string }[] = [
  { value: 'js', label: 'JS / TS' },
  { value: 'python', label: 'Python' },
  { value: 'graphql', label: 'GraphQL' }
]

/** Shows the current query as client code, so the UI doubles as a way to
 *  learn the SDK rather than a dead end you have to translate by hand. */
export function CodeModal({ request, onClose }: Props) {
  const [language, setLanguage] = useState<CodeLanguage>('js')
  const code = generateCode(request, language)

  return (
    <Modal opened onClose={onClose} title="Query as code" size="lg">
      <Stack gap="sm">
        <Group justify="space-between">
          <SegmentedControl
            size="xs"
            data={LANGUAGES}
            value={language}
            onChange={(v) => setLanguage(v as CodeLanguage)}
          />
          <CopyButton value={code} timeout={1500}>
            {({ copied, copy }) => (
              <Button
                size="compact-sm"
                variant="light"
                color={copied ? 'teal' : undefined}
                leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            )}
          </CopyButton>
        </Group>
        <Code block className="weft-mono" style={{ maxHeight: 460, overflow: 'auto', fontSize: 12.5 }}>
          {code}
        </Code>
      </Stack>
    </Modal>
  )
}
