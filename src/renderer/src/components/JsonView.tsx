import { CopyButton, ActionIcon, Tooltip, Box } from '@mantine/core'
import { IconCopy, IconCheck } from '@tabler/icons-react'

interface Props {
  value: unknown
  maxHeight?: number
}

// Read-only pretty-printed JSON with a copy button. Kept as a <pre> (not an
// editor) so large vectors render cheaply.
export function JsonView({ value, maxHeight = 460 }: Props) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return (
    <Box pos="relative">
      <Box style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
        <CopyButton value={text} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
              <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Box>
      <Box
        className="weft-mono weft-json"
        p="sm"
        style={{
          maxHeight,
          background: 'var(--mantine-color-dark-8)',
          border: '1px solid var(--mantine-color-dark-4)',
          borderRadius: 'var(--mantine-radius-md)'
        }}
      >
        {text}
      </Box>
    </Box>
  )
}
