import { useState } from 'react'
import {
  Box,
  Stack,
  Group,
  Text,
  Table,
  Badge,
  Button,
  Center,
  Loader,
  Alert,
  Paper,
  Select,
  NumberInput,
  TextInput,
  ActionIcon,
  Tooltip,
  Progress,
  SimpleGrid
} from '@mantine/core'
import {
  IconRefresh,
  IconAlertTriangle,
  IconChartBar,
  IconTargetArrow,
  IconUpload
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AggregateSearchSpec, AggregateSearchType, PropertyStats } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr } from '../../lib/notify'
import { pickBinaryFile } from '../../lib/exportFile'

interface Props {
  connectionId: string
  collection: string
  tenant?: string
  properties: { name: string; dataType: string[] }[]
  namedVectors?: string[]
}

/** Aggregate takes the near-* family and hybrid — not bm25, not nearMedia. */
const SCOPE_TYPES: { label: string; value: AggregateSearchType }[] = [
  { label: 'Near text', value: 'nearText' },
  { label: 'Hybrid', value: 'hybrid' },
  { label: 'Near vector', value: 'nearVector' },
  { label: 'Near object', value: 'nearObject' },
  { label: 'Near image', value: 'nearImage' }
]

function fmt(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(3)
  }
  return String(value)
}

/** The metrics worth showing differ by property kind. */
function NumericStats({ p }: { p: PropertyStats }) {
  const cells = [
    ['count', p.count],
    ['min', p.minimum],
    ['max', p.maximum],
    ['mean', p.mean],
    ['median', p.median],
    ['mode', p.mode],
    ['sum', p.sum]
  ] as const

  return (
    <SimpleGrid cols={4} spacing="xs">
      {cells
        .filter(([, v]) => v !== undefined)
        .map(([label, v]) => (
          <div key={label}>
            <Text size="10px" c="dimmed" tt="uppercase">
              {label}
            </Text>
            <Text size="sm" className="weft-mono">
              {fmt(v)}
            </Text>
          </div>
        ))}
    </SimpleGrid>
  )
}

function TextStats({ p }: { p: PropertyStats }) {
  const top = p.topOccurrences ?? []
  const max = Math.max(1, ...top.map((t) => t.occurs ?? 0))
  if (top.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {p.count ?? 0} values, no top occurrences returned.
      </Text>
    )
  }
  return (
    <Stack gap={4}>
      {top.slice(0, 10).map((t, i) => (
        <Group key={i} gap="xs" wrap="nowrap">
          <Text size="xs" w={180} truncate title={t.value}>
            {t.value || '(empty)'}
          </Text>
          <Progress value={((t.occurs ?? 0) / max) * 100} style={{ flex: 1 }} size="sm" />
          <Text size="xs" c="dimmed" w={50} ta="right">
            {t.occurs ?? 0}
          </Text>
        </Group>
      ))}
    </Stack>
  )
}

function BooleanStats({ p }: { p: PropertyStats }) {
  const truePct = p.percentageTrue ?? 0
  return (
    <Stack gap={4}>
      <Progress.Root size="lg">
        <Progress.Section value={truePct} color="teal">
          <Progress.Label>true {truePct.toFixed(0)}%</Progress.Label>
        </Progress.Section>
        <Progress.Section value={p.percentageFalse ?? 0} color="gray">
          <Progress.Label>false</Progress.Label>
        </Progress.Section>
      </Progress.Root>
      <Text size="xs" c="dimmed">
        {p.totalTrue ?? 0} true · {p.totalFalse ?? 0} false
      </Text>
    </Stack>
  )
}

/**
 * Per-property aggregation over the collection: value distributions, ranges and
 * top occurrences. This is `collection.aggregate` with per-property metrics,
 * which is a much richer thing than the object count shown elsewhere.
 *
 * By default it aggregates over everything. Scoping it to a search narrows the
 * aggregation to that search's matches, which is how you ask what the top
 * results for a query actually look like.
 */
export function StatsPanel({
  connectionId,
  collection,
  tenant,
  properties,
  namedVectors = []
}: Props) {
  const qc = useQueryClient()
  const [groupBy, setGroupBy] = useState<string | null>(null)
  const [scope, setScope] = useState<AggregateSearchSpec | null>(null)
  // Held separately so editing the form doesn't refire the aggregation on every
  // keystroke — it runs when the user applies it.
  const [applied, setApplied] = useState<AggregateSearchSpec | null>(null)
  const [mediaName, setMediaName] = useState<string>()

  const stats = useQuery({
    queryKey: ['stats', connectionId, collection, tenant, groupBy, applied],
    queryFn: () =>
      api.query.collectionStats({
        connectionId,
        collection,
        tenant,
        groupBy: groupBy ?? undefined,
        search: applied ?? undefined
      })
  })

  const patchScope = (p: Partial<AggregateSearchSpec>) =>
    setScope((s) => ({ ...(s ?? { type: 'nearText' }), ...p }))

  const setScopeType = (value: string | null) => {
    if (!value) {
      setScope(null)
      setApplied(null)
      setMediaName(undefined)
      return
    }
    setScope((s) => ({ ...(s ?? {}), type: value as AggregateSearchType }))
  }

  const chooseImage = async () => {
    const file = await pickBinaryFile('image/*')
    if (!file) return
    patchScope({ queryMedia: file.base64 })
    setMediaName(file.name)
  }

  const applyScope = () => {
    if (!scope) return
    // The main process validates properly; this only avoids an obvious round-trip.
    const needsText = scope.type === 'nearText' || scope.type === 'hybrid'
    if (needsText && !scope.queryText?.trim()) {
      notifyErr('Scope needs a query', 'Type what to search for first')
      return
    }
    if (scope.type === 'nearObject' && !scope.queryObjectId?.trim()) {
      notifyErr('Scope needs a UUID', 'Near object aggregation searches from an existing object')
      return
    }
    if (scope.type === 'nearImage' && !scope.queryMedia) {
      notifyErr('Scope needs an image', 'Choose the image to search with')
      return
    }
    if (scope.type === 'nearVector' && !scope.queryVector?.trim()) {
      notifyErr('Scope needs a vector', 'Paste a JSON array of numbers')
      return
    }
    setApplied(scope)
  }

  // Only text-ish properties make sensible group-by keys.
  const groupable = properties
    .filter((p) => ['text', 'string', 'boolean', 'int'].includes(p.dataType[0]?.replace(/\[\]$/, '')))
    .map((p) => p.name)

  const data = stats.data
  const maxGroup = Math.max(1, ...(data?.groups ?? []).map((g) => g.count))

  return (
    <Box p="md" style={{ height: '100%', overflow: 'auto' }}>
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <IconChartBar size={18} />
          <Text fw={700}>
            {data ? `${data.totalCount.toLocaleString()} objects` : 'Aggregating…'}
            {data && applied ? ' matched' : ''}
          </Text>
          {tenant && (
            <Badge size="xs" variant="light" color="grape">
              tenant {tenant}
            </Badge>
          )}
          {applied && (
            <Badge size="xs" variant="light" color="aqua">
              scoped to {applied.type}
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          <Select
            size="xs"
            placeholder="Group by…"
            clearable
            searchable
            w={200}
            data={groupable}
            value={groupBy}
            onChange={setGroupBy}
          />
          <Tooltip label="Refresh">
            <ActionIcon
              variant="light"
              onClick={() => qc.invalidateQueries({ queryKey: ['stats', connectionId, collection] })}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Paper withBorder p="sm" mb="md">
        <Group gap="xs" align="end" wrap="wrap">
          <Select
            size="xs"
            label="Aggregate over"
            placeholder="Whole collection"
            clearable
            w={150}
            data={SCOPE_TYPES}
            value={scope?.type ?? null}
            onChange={setScopeType}
          />
          {scope && (
            <>
              {(scope.type === 'nearText' || scope.type === 'hybrid') && (
                <TextInput
                  size="xs"
                  label="Query"
                  placeholder="running shoes"
                  value={scope.queryText ?? ''}
                  onChange={(e) => patchScope({ queryText: e.currentTarget.value })}
                  style={{ flex: 1, minWidth: 200 }}
                />
              )}
              {scope.type === 'nearVector' && (
                <TextInput
                  size="xs"
                  label="Vector"
                  placeholder="[0.12, 0.98, …]"
                  value={scope.queryVector ?? ''}
                  onChange={(e) => patchScope({ queryVector: e.currentTarget.value })}
                  style={{ flex: 1, minWidth: 200 }}
                />
              )}
              {scope.type === 'nearObject' && (
                <TextInput
                  size="xs"
                  label="Object UUID"
                  placeholder="8f4c…"
                  value={scope.queryObjectId ?? ''}
                  onChange={(e) => patchScope({ queryObjectId: e.currentTarget.value })}
                  style={{ flex: 1, minWidth: 200 }}
                />
              )}
              {scope.type === 'nearImage' && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconUpload size={14} />}
                  onClick={chooseImage}
                >
                  {mediaName ?? 'Choose image'}
                </Button>
              )}
              {scope.type === 'hybrid' && (
                <NumberInput
                  size="xs"
                  label="Alpha"
                  w={90}
                  min={0}
                  max={1}
                  step={0.1}
                  value={scope.alpha ?? 0.5}
                  onChange={(v) => patchScope({ alpha: typeof v === 'number' ? v : undefined })}
                />
              )}
              {scope.type !== 'hybrid' && (
                <NumberInput
                  size="xs"
                  label="Max distance"
                  placeholder="none"
                  w={120}
                  min={0}
                  step={0.05}
                  value={scope.distance ?? ''}
                  onChange={(v) => patchScope({ distance: typeof v === 'number' ? v : undefined })}
                />
              )}
              <NumberInput
                size="xs"
                label="Object limit"
                description="matches aggregated"
                placeholder="100"
                w={130}
                min={1}
                value={scope.objectLimit ?? ''}
                onChange={(v) => patchScope({ objectLimit: typeof v === 'number' ? v : undefined })}
              />
              {namedVectors.length > 0 && (
                <Select
                  size="xs"
                  label="Target vector"
                  placeholder="default"
                  clearable
                  w={150}
                  data={namedVectors}
                  value={scope.targetVector ?? null}
                  onChange={(v) => patchScope({ targetVector: v ?? undefined })}
                />
              )}
              <Button
                size="xs"
                leftSection={<IconTargetArrow size={14} />}
                onClick={applyScope}
                loading={stats.isFetching}
              >
                Apply
              </Button>
            </>
          )}
        </Group>
        {applied && (
          <Text size="xs" c="dimmed" mt={6}>
            Every metric below counts only the objects this search matched, not the whole
            collection.
          </Text>
        )}
      </Paper>

      {stats.isLoading && (
        <Center h={160}>
          <Loader />
        </Center>
      )}

      {stats.isError && (
        <Alert color="red" icon={<IconAlertTriangle />} title="Could not aggregate">
          {(stats.error as Error).message}
        </Alert>
      )}

      {data && (
        <>
        {data.groups && data.groups.length > 0 && (
          <Paper withBorder p="sm" mb="md">
            <Text size="sm" fw={600} mb="xs">
              Objects by {groupBy}
            </Text>
            <Stack gap={4}>
              {data.groups.map((g) => (
                <Group key={g.value} gap="xs" wrap="nowrap">
                  <Text size="xs" w={180} truncate title={g.value}>
                    {g.value || '(empty)'}
                  </Text>
                  <Progress value={(g.count / maxGroup) * 100} style={{ flex: 1 }} size="sm" color="grape" />
                  <Text size="xs" c="dimmed" w={60} ta="right">
                    {g.count}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Paper>
        )}

        <Stack gap="sm">
          {data.properties.map((p) => (
            <Paper key={p.property} withBorder p="sm">
              <Group gap="xs" mb="xs">
                <Text fw={600} size="sm" c="aqua.4">
                  {p.property}
                </Text>
                <Badge size="xs" variant="light">
                  {p.kind}
                </Badge>
                {p.count != null && (
                  <Text size="xs" c="dimmed">
                    {p.count} non-null
                  </Text>
                )}
              </Group>
              {p.kind === 'text' && <TextStats p={p} />}
              {p.kind === 'boolean' && <BooleanStats p={p} />}
              {(p.kind === 'integer' || p.kind === 'number' || p.kind === 'date') && (
                <NumericStats p={p} />
              )}
            </Paper>
          ))}
        </Stack>

        {data.skipped.length > 0 && (
          <Alert color="gray" mt="md" title="Not aggregated">
            <Table withRowBorders={false} verticalSpacing={2}>
              <Table.Tbody>
                {data.skipped.map((s) => (
                  <Table.Tr key={s.property}>
                    <Table.Td style={{ width: 160 }}>
                      <Text size="xs" fw={600}>
                        {s.property}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {s.reason}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Alert>
        )}
        </>
      )}
    </Box>
  )
}
