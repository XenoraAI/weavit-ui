import { Stack, Group, Text, Table, Badge, Paper, Accordion, Code } from '@mantine/core'
import type { WeaviateMeta } from '@shared/types'
import { JsonView } from '../../components/JsonView'

/** Modules with no settings of their own don't need an expandable row. */
function hasConfig(config: unknown): boolean {
  return Boolean(config && typeof config === 'object' && Object.keys(config).length > 0)
}

/**
 * The instance's identity and its enabled modules. Modules are the interesting
 * part — which vectorizers, generative and backup backends are available is
 * what decides whether half the app's features can work at all.
 */
export function MetaView({ meta }: { meta: WeaviateMeta }) {
  const modules = Object.entries(meta.modules ?? {})

  return (
    <Stack gap="sm">
      <Paper withBorder p="sm">
        <Table withRowBorders={false} verticalSpacing={6}>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td style={{ width: 140 }}>
                <Text size="sm" c="dimmed">
                  Version
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={600}>
                  {meta.version ?? '—'}
                </Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  Hostname
                </Text>
              </Table.Td>
              <Table.Td>
                <Code>{meta.hostname ?? '—'}</Code>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  Modules
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{modules.length}</Text>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Paper>

      {modules.length === 0 ? (
        <Text c="dimmed" size="sm">
          No modules enabled. Vectorizers, generative search and backups all need one.
        </Text>
      ) : (
        <Accordion variant="separated" chevronPosition="left">
          {modules.map(([name, config]) => (
            <Accordion.Item key={name} value={name}>
              <Accordion.Control>
                <Group gap="xs">
                  <Badge variant="light" color="aqua">
                    {name}
                  </Badge>
                  {!hasConfig(config) && (
                    <Text size="xs" c="dimmed">
                      no settings
                    </Text>
                  )}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {hasConfig(config) ? (
                  <JsonView value={config} maxHeight={220} />
                ) : (
                  <Text size="xs" c="dimmed">
                    This module reports no configuration of its own.
                  </Text>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </Stack>
  )
}
