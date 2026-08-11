import { Stack, Group, Text, Table, Badge, Paper, Progress, Tooltip, Anchor } from '@mantine/core'
import { IconServer } from '@tabler/icons-react'
import type { ClusterNodeInfo } from '@shared/types'
import { useApp } from '../../store'

const NODE_COLOR: Record<string, string> = {
  HEALTHY: 'teal',
  UNHEALTHY: 'red',
  UNAVAILABLE: 'orange'
}

/** Anything other than READY means the shard is still catching up. */
function indexingColor(status?: string): string {
  if (!status) return 'gray'
  return status.toUpperCase() === 'READY' ? 'teal' : 'yellow'
}

/**
 * Nodes and their shards, rendered rather than dumped. The numbers that matter
 * operationally are the object counts per shard and whether the vector index
 * has caught up — a non-empty queue means writes are still being indexed.
 */
export function NodeCards({ nodes }: { nodes: ClusterNodeInfo[] }) {
  // A shard row names the collection it belongs to; clicking it opens that
  // collection, the same as picking it from the sidebar.
  const selectCollection = useApp((s) => s.selectCollection)

  if (nodes.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No nodes reported.
      </Text>
    )
  }

  // Scale the per-shard bars against the busiest shard across the whole cluster
  // so they stay comparable between nodes.
  const maxObjects = Math.max(1, ...nodes.flatMap((n) => n.shards.map((s) => s.objectCount ?? 0)))

  return (
    <Stack gap="sm">
      {nodes.map((node) => (
        <Paper key={node.name} withBorder p="sm">
          <Group justify="space-between" mb={node.shards.length ? 'xs' : 0}>
            <Group gap="xs">
              <IconServer size={16} />
              <Text fw={600}>{node.name}</Text>
              <Badge variant="light" color={NODE_COLOR[node.status] ?? 'gray'}>
                {node.status}
              </Badge>
              {node.version && (
                <Text size="xs" c="dimmed">
                  v{node.version}
                </Text>
              )}
              {node.gitHash && (
                <Tooltip label="Build">
                  <Text size="xs" c="dimmed" className="weft-mono">
                    {node.gitHash.slice(0, 7)}
                  </Text>
                </Tooltip>
              )}
            </Group>
            {node.stats && (
              <Text size="xs" c="dimmed">
                {(node.stats.shardCount ?? 0).toLocaleString()} shards ·{' '}
                {(node.stats.objectCount ?? 0).toLocaleString()} objects
              </Text>
            )}
          </Group>

          {node.shards.length > 0 && (
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Collection</Table.Th>
                  <Table.Th>Shard</Table.Th>
                  <Table.Th style={{ width: '32%' }}>Objects</Table.Th>
                  <Table.Th>Vector index</Table.Th>
                  <Table.Th>Queue</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {node.shards.map((s) => (
                  <Table.Tr key={`${s.class}:${s.name}`}>
                    <Table.Td>
                      <Tooltip label={`Open ${s.class}`} openDelay={400}>
                        <Anchor
                          component="button"
                          type="button"
                          size="sm"
                          fw={500}
                          onClick={() => selectCollection(s.class)}
                        >
                          {s.class}
                        </Anchor>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" className="weft-mono" title={s.name}>
                        {s.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Progress
                          value={((s.objectCount ?? 0) / maxObjects) * 100}
                          size="sm"
                          style={{ flex: 1 }}
                          color="aqua"
                        />
                        <Text size="xs" w={60} ta="right">
                          {(s.objectCount ?? 0).toLocaleString()}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Badge size="xs" variant="light" color={indexingColor(s.vectorIndexingStatus)}>
                          {s.vectorIndexingStatus ?? 'unknown'}
                        </Badge>
                        {s.compressed && (
                          <Badge size="xs" variant="light" color="violet">
                            compressed
                          </Badge>
                        )}
                        {s.loaded === false && (
                          <Badge size="xs" variant="light" color="gray">
                            not loaded
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c={s.vectorQueueLength ? 'yellow' : 'dimmed'}>
                        {s.vectorQueueLength ?? 0}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      ))}
    </Stack>
  )
}
