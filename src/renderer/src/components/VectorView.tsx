import { Stack, Group, Badge, CopyButton, Button, Text, Code } from '@mantine/core'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import type { VectorValue } from '@shared/types'

interface Props {
  vectors?: Record<string, VectorValue>
}

/** ColBERT-style spaces return a list of vectors rather than a single one. */
function isMultiVector(vec: VectorValue): vec is number[][] {
  return Array.isArray(vec[0])
}

function preview(vec: number[]): string {
  const head = vec.slice(0, 24).map((n) => n.toFixed(4)).join(', ')
  return `[${head}${vec.length > 24 ? ', …' : ''}]`
}

export function VectorView({ vectors }: Props) {
  const entries = Object.entries(vectors ?? {})
  if (entries.length === 0) return <Text c="dimmed" size="sm">No vectors returned. Enable “Include vectors”.</Text>

  return (
    <Stack gap="sm">
      {entries.map(([name, vec]) => {
        const multi = isMultiVector(vec)
        const dims = multi ? (vec[0]?.length ?? 0) : vec.length
        return (
          <div key={name}>
            <Group gap="xs" mb={4}>
              <Badge variant="light" color="aqua">{name}</Badge>
              <Text size="xs" c="dimmed">
                {multi ? `${vec.length} × ${dims} dimensions` : `${dims} dimensions`}
              </Text>
              <CopyButton value={JSON.stringify(vec)} timeout={1500}>
                {({ copied, copy }) => (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color={copied ? 'teal' : 'gray'}
                    leftSection={copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                    onClick={copy}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Code block className="weft-mono" style={{ maxHeight: 90, overflow: 'auto' }}>
              {multi
                ? vec.slice(0, 4).map(preview).join('\n') + (vec.length > 4 ? '\n…' : '')
                : preview(vec)}
            </Code>
          </div>
        )
      })}
    </Stack>
  )
}
