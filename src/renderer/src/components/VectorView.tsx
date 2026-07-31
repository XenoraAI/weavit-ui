import { Stack, Group, Badge, CopyButton, Button, Text, Code } from '@mantine/core'
import { IconCopy, IconCheck } from '@tabler/icons-react'

interface Props {
  vectors?: Record<string, number[]>
}

export function VectorView({ vectors }: Props) {
  const entries = Object.entries(vectors ?? {})
  if (entries.length === 0) return <Text c="dimmed" size="sm">No vectors returned. Enable “Include vectors”.</Text>

  return (
    <Stack gap="sm">
      {entries.map(([name, vec]) => (
        <div key={name}>
          <Group gap="xs" mb={4}>
            <Badge variant="light" color="aqua">{name}</Badge>
            <Text size="xs" c="dimmed">{vec.length} dimensions</Text>
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
            [{vec.slice(0, 24).map((n) => n.toFixed(4)).join(', ')}
            {vec.length > 24 ? ', …' : ''}]
          </Code>
        </div>
      ))}
    </Stack>
  )
}
