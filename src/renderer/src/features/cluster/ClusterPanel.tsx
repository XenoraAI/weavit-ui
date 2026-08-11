import { useState } from 'react'
import {
  Box,
  Stack,
  Group,
  Text,
  Table,
  Badge,
  Center,
  Loader,
  Alert,
  ActionIcon,
  Tooltip,
  Code,
  Select,
  Button,
  Modal,
  Tabs
} from '@mantine/core'
import {
  IconRefresh,
  IconAlertTriangle,
  IconInfoCircle,
  IconServer,
  IconArrowsShuffle,
  IconTrash,
  IconPlayerStop
} from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClusterFeatureAvailability, ReplicationType } from '@shared/types'
import { api, errMsg } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { InspectPanel } from '../../components/InspectPanel'
import { NodeCards } from './NodeCards'

interface Props {
  connectionId: string
}

// Replica movement is an optional feature, not a broken one. Each way it can
// be missing gets its own explanation and the fix that goes with it, rather
// than the raw status code the server answered with.
const UNAVAILABLE: Record<
  NonNullable<ClusterFeatureAvailability['reason']>,
  { title: string; body: string }
> = {
  notImplemented: {
    title: 'Replica movement is disabled on this instance',
    body:
      'Weaviate reports the replication engine as switched off. Moving or copying a shard replica needs a multi-node cluster with replication enabled — a single-node instance has nowhere to move a replica to.'
  },
  notFound: {
    title: 'This Weaviate version has no replication API',
    body: 'Shard replica movement was added in Weaviate 1.32. Upgrade the instance to manage replica placement from here.'
  },
  unauthorized: {
    title: 'Not allowed to read replication operations',
    body: 'This connection’s credentials lack permission to read cluster replication state. It needs a role with read access to the cluster.'
  },
  error: {
    title: 'Could not read replication operations',
    body: 'Weaviate rejected the request for the list of replication operations.'
  }
}

function UnavailableNotice({ availability }: { availability: ClusterFeatureAvailability }) {
  const reason = availability.reason ?? 'error'
  const copy = UNAVAILABLE[reason]
  const isFault = reason === 'error'
  return (
    <Alert
      color={isFault ? 'red' : 'gray'}
      icon={isFault ? <IconAlertTriangle size={18} /> : <IconInfoCircle size={18} />}
      title={copy.title}
    >
      <Text size="sm">{copy.body}</Text>
      {availability.detail && (
        <Text size="xs" c="dimmed" mt={6}>
          Weaviate said: {availability.detail}
        </Text>
      )}
    </Alert>
  )
}

function NodesTab({ connectionId }: Props) {
  const qc = useQueryClient()
  const nodes = useQuery({
    queryKey: ['clusterNodes', connectionId],
    queryFn: () => api.cluster.nodes(connectionId)
  })

  if (nodes.isLoading) {
    return (
      <Center h={160}>
        <Loader />
      </Center>
    )
  }
  if (nodes.isError) {
    return (
      <Alert color="red" icon={<IconAlertTriangle />} title="Could not read cluster state">
        {errMsg(nodes.error)}
      </Alert>
    )
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {nodes.data?.length ?? 0} nodes
        </Text>
        <ActionIcon
          variant="light"
          onClick={() => qc.invalidateQueries({ queryKey: ['clusterNodes', connectionId] })}
        >
          <IconRefresh size={16} />
        </ActionIcon>
      </Group>

      <InspectPanel name="cluster-nodes" value={nodes.data ?? []} maxHeight={520}>
        <NodeCards nodes={nodes.data ?? []} />
      </InspectPanel>
    </Stack>
  )
}

function ReplicationTab({ connectionId }: Props) {
  const qc = useQueryClient()
  const [starting, setStarting] = useState(false)
  const [collection, setCollection] = useState<string | null>(null)
  const [shard, setShard] = useState<string | null>(null)
  const [sourceNode, setSourceNode] = useState<string | null>(null)
  const [targetNode, setTargetNode] = useState<string | null>(null)
  const [replicationType, setReplicationType] = useState<ReplicationType>('COPY')

  const collections = useQuery({
    queryKey: ['collections', connectionId],
    queryFn: () => api.schema.listCollections(connectionId)
  })
  const nodes = useQuery({
    queryKey: ['clusterNodes', connectionId],
    queryFn: () => api.cluster.nodes(connectionId)
  })
  const ops = useQuery({
    queryKey: ['replications', connectionId],
    queryFn: () => api.cluster.listReplications(connectionId)
  })
  const sharding = useQuery({
    queryKey: ['shardingState', connectionId, collection],
    queryFn: () => api.cluster.shardingState(connectionId, collection!),
    enabled: collection !== null,
    // A single-node deployment answers 501 here; retrying won't change that.
    retry: false
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['replications', connectionId] })

  const start = useMutation({
    mutationFn: () =>
      api.cluster.replicate({
        connectionId,
        collection: collection!,
        shard: shard!,
        sourceNode: sourceNode!,
        targetNode: targetNode!,
        replicationType
      }),
    onSuccess: (r) => {
      notifyOk(`Replication ${r.id} started`)
      setStarting(false)
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not start replication')
  })

  const cancel = useMutation({
    mutationFn: (id: string) => api.cluster.cancelReplication(connectionId, id),
    onSuccess: () => {
      notifyOk('Cancellation requested')
      invalidate()
    },
    onError: (e) => notifyErr(e)
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.cluster.deleteReplication(connectionId, id),
    onSuccess: () => {
      notifyOk('Operation removed')
      invalidate()
    },
    onError: (e) => notifyErr(e)
  })

  const nodeNames = (nodes.data ?? []).map((n) => n.name)
  const shardNames = (sharding.data?.shards ?? []).map((s) => s.shard)
  const shardsAvailability = sharding.data?.availability
  const shardsUnsupported =
    shardsAvailability && !shardsAvailability.available ? shardsAvailability : undefined
  const shardsUnavailable = sharding.isError || !!shardsUnsupported

  // "Not supported here" comes back as data, so an actual thrown error is a
  // transport problem and stays a red alert; the two are kept apart on purpose.
  const availability = ops.data?.availability
  const unsupported = availability && !availability.available ? availability : undefined
  // Only positive knowledge disables the button — while the list is still
  // loading there is nothing to say yet.
  const canReplicate = !unsupported

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Moving or copying a shard replica between nodes. Runs asynchronously on the server.
        </Text>
        <Group gap="xs">
          <ActionIcon variant="light" onClick={invalidate}>
            <IconRefresh size={16} />
          </ActionIcon>
          <Tooltip
            label={
              canReplicate
                ? 'Move or copy a replica'
                : UNAVAILABLE[unsupported?.reason ?? 'error'].title
            }
          >
            {/* data-disabled rather than disabled, so the tooltip still
                explains why the button is dead. */}
            <Button
              size="xs"
              data-disabled={!canReplicate || undefined}
              leftSection={<IconArrowsShuffle size={15} />}
              onClick={(e) => (canReplicate ? setStarting(true) : e.preventDefault())}
            >
              Replicate shard
            </Button>
          </Tooltip>
        </Group>
      </Group>

      {ops.isError && (
        <Alert color="red" icon={<IconAlertTriangle />} title="Could not list replication ops">
          {errMsg(ops.error)}
        </Alert>
      )}
      {unsupported && <UnavailableNotice availability={unsupported} />}
      {ops.data?.availability.available && ops.data.ops.length === 0 && (
        <Text c="dimmed">No replication operations.</Text>
      )}

      {(ops.data?.ops.length ?? 0) > 0 && (
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Collection / shard</Table.Th>
              <Table.Th>From → to</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th w={100} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {ops.data?.ops.map((op) => (
              <Table.Tr key={op.id}>
                <Table.Td>
                  <Code>{op.id?.slice(0, 8)}…</Code>
                </Table.Td>
                <Table.Td>
                  {op.collection} / {op.shard}
                </Table.Td>
                <Table.Td>
                  <Text size="xs">
                    {op.sourceNode} → {op.targetNode}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge size="xs" variant="light">
                    {op.status ?? 'unknown'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end">
                    <Tooltip label="Cancel">
                      <ActionIcon variant="subtle" color="orange" onClick={() => cancel.mutate(op.id)}>
                        <IconPlayerStop size={15} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Remove record">
                      <ActionIcon variant="subtle" color="red" onClick={() => remove.mutate(op.id)}>
                        <IconTrash size={15} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={starting} onClose={() => setStarting(false)} title="Replicate a shard" centered>
        <Stack gap="sm">
          <Select
            label="Collection"
            searchable
            data={(collections.data ?? []).map((c) => c.name)}
            value={collection}
            onChange={(v) => {
              setCollection(v)
              setShard(null)
            }}
          />
          <Select
            label="Shard"
            searchable
            disabled={!collection}
            data={shardNames}
            value={shard}
            onChange={setShard}
            error={shardsUnavailable ? 'Could not read the sharding state' : undefined}
            description={
              collection && !shardsUnavailable && shardNames.length === 0 && !sharding.isLoading
                ? 'No shards reported for this collection'
                : undefined
            }
          />
          {sharding.isError && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />} p="xs">
              <Text size="xs">{errMsg(sharding.error)}</Text>
            </Alert>
          )}
          {shardsUnsupported && <UnavailableNotice availability={shardsUnsupported} />}
          <Group grow>
            <Select label="Source node" data={nodeNames} value={sourceNode} onChange={setSourceNode} />
            <Select label="Target node" data={nodeNames} value={targetNode} onChange={setTargetNode} />
          </Group>
          <Select
            label="Operation"
            description="COPY leaves the source in place; MOVE removes it after transfer"
            data={['COPY', 'MOVE']}
            value={replicationType}
            onChange={(v) => setReplicationType((v as ReplicationType) ?? 'COPY')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setStarting(false)}>
              Cancel
            </Button>
            <Button
              disabled={!collection || !shard || !sourceNode || !targetNode || sourceNode === targetNode}
              loading={start.isPending}
              onClick={() => start.mutate()}
            >
              Start
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

export function ClusterPanel({ connectionId }: Props) {
  return (
    <Box p="md" style={{ height: '100%', overflow: 'auto' }}>
      <Text fw={700} size="lg" mb={4}>
        Cluster
      </Text>
      <Text size="sm" c="dimmed" mb="md">
        Node health, shard placement, and replica movement.
      </Text>

      <Tabs defaultValue="nodes">
        <Tabs.List mb="md">
          <Tabs.Tab value="nodes" leftSection={<IconServer size={15} />}>
            Nodes &amp; shards
          </Tabs.Tab>
          <Tabs.Tab value="replication" leftSection={<IconArrowsShuffle size={15} />}>
            Replication
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="nodes">
          <NodesTab connectionId={connectionId} />
        </Tabs.Panel>
        <Tabs.Panel value="replication">
          <ReplicationTab connectionId={connectionId} />
        </Tabs.Panel>
      </Tabs>
    </Box>
  )
}
