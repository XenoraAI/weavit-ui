import {
  Accordion,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  ActionIcon,
  Button,
  MultiSelect,
  Divider
} from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { SearchRequest, SearchType, SortDirection, SortSpec } from '@shared/types'

// Everything the query panel supports beyond "type a query and hit run". Kept
// behind an accordion so the common path stays a single row of controls.

interface Props {
  req: SearchRequest
  patch: (p: Partial<SearchRequest>) => void
  properties: string[]
  namedVectors: string[]
  hasReranker: boolean
}

const VECTOR_TYPES: SearchType[] = ['nearText', 'nearVector', 'nearObject', 'nearImage', 'nearMedia']
const SORT_FIELDS = ['_id', '_creationTime', '_updateTime']

function SortEditor({
  sort,
  properties,
  onChange
}: {
  sort: SortSpec[]
  properties: string[]
  onChange: (s: SortSpec[]) => void
}) {
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Sorting applies to Fetch only — a scored search already has an order.
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPlus size={13} />}
          onClick={() => onChange([...sort, { property: properties[0] ?? '_id', direction: 'asc' }])}
        >
          Add
        </Button>
      </Group>
      {sort.map((s, i) => (
        <Group key={i} gap="xs" wrap="nowrap">
          <Select
            size="xs"
            searchable
            data={[...SORT_FIELDS, ...properties]}
            value={s.property}
            onChange={(v) =>
              onChange(sort.map((x, idx) => (idx === i ? { ...x, property: v ?? '' } : x)))
            }
            style={{ flex: 1 }}
          />
          <Select
            size="xs"
            w={110}
            data={[
              { value: 'asc', label: 'ascending' },
              { value: 'desc', label: 'descending' }
            ]}
            value={s.direction}
            onChange={(v) =>
              onChange(
                sort.map((x, idx) =>
                  idx === i ? { ...x, direction: (v as SortDirection) ?? 'asc' } : x
                )
              )
            }
          />
          <ActionIcon
            color="red"
            variant="subtle"
            onClick={() => onChange(sort.filter((_, idx) => idx !== i))}
          >
            <IconTrash size={15} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  )
}

export function AdvancedOptions({ req, patch, properties, namedVectors, hasReranker }: Props) {
  const isVector = VECTOR_TYPES.includes(req.type)
  const isKeyword = req.type === 'bm25' || req.type === 'hybrid'

  return (
    <Accordion variant="separated" chevronPosition="left" multiple>
      <Accordion.Item value="paging">
        <Accordion.Control>
          <Text size="sm">Paging &amp; cutoff</Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Group grow align="end">
            <NumberInput
              size="xs"
              label="Offset"
              min={0}
              value={req.offset ?? 0}
              onChange={(v) => patch({ offset: Number(v) || undefined })}
            />
            <NumberInput
              size="xs"
              label="Autocut"
              description="Stop after N score jumps"
              min={0}
              value={req.autoLimit ?? 0}
              onChange={(v) => patch({ autoLimit: Number(v) || undefined })}
            />
            <Select
              size="xs"
              label="Consistency"
              clearable
              data={['ONE', 'QUORUM', 'ALL']}
              value={req.consistencyLevel ?? null}
              onChange={(v) => patch({ consistencyLevel: (v as SearchRequest['consistencyLevel']) ?? undefined })}
            />
          </Group>
          {namedVectors.length > 1 && req.includeVector && (
            <MultiSelect
              size="xs"
              mt="sm"
              label="Return only these vectors"
              description="Fetching every named vector costs bandwidth you may not need"
              data={namedVectors}
              value={req.vectorNames ?? []}
              onChange={(v) => patch({ vectorNames: v.length ? v : undefined })}
            />
          )}
        </Accordion.Panel>
      </Accordion.Item>

      {isVector && (
        <Accordion.Item value="vector">
          <Accordion.Control>
            <Text size="sm">Vector thresholds &amp; targets</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Group grow align="end">
                <NumberInput
                  size="xs"
                  label="Max distance"
                  description="Lower is closer"
                  step={0.05}
                  decimalScale={4}
                  value={req.distance ?? ''}
                  onChange={(v) =>
                    patch({ distance: v === '' ? undefined : Number(v), certainty: undefined })
                  }
                />
                <NumberInput
                  size="xs"
                  label="Min certainty"
                  description="0–1, cosine only"
                  min={0}
                  max={1}
                  step={0.05}
                  decimalScale={4}
                  value={req.certainty ?? ''}
                  onChange={(v) =>
                    patch({ certainty: v === '' ? undefined : Number(v), distance: undefined })
                  }
                />
              </Group>
              <Divider label="Result diversity" labelPosition="left" />
              <Group grow align="end">
                <NumberInput
                  size="xs"
                  label="Diversify (MMR)"
                  description="How many results to spread out"
                  placeholder="off"
                  min={1}
                  value={req.diversity?.limit ?? ''}
                  onChange={(v) =>
                    patch({
                      diversity:
                        v === '' ? undefined : { ...req.diversity, limit: Number(v) }
                    })
                  }
                />
                <NumberInput
                  size="xs"
                  label="Balance"
                  description="0 variety – 1 similarity"
                  min={0}
                  max={1}
                  step={0.1}
                  decimalScale={2}
                  disabled={!req.diversity}
                  value={req.diversity?.balance ?? ''}
                  onChange={(v) =>
                    patch({
                      diversity: req.diversity
                        ? { ...req.diversity, balance: v === '' ? undefined : Number(v) }
                        : undefined
                    })
                  }
                />
              </Group>
              {namedVectors.length > 1 && (
                <>
                  <Divider label="Multi-target search" labelPosition="left" />
                  <Group grow align="end">
                    <MultiSelect
                      size="xs"
                      label="Combine named vectors"
                      data={namedVectors}
                      value={req.multiTarget?.targets ?? []}
                      onChange={(v) =>
                        patch({
                          multiTarget: v.length
                            ? { targets: v, join: req.multiTarget?.join ?? 'average' }
                            : undefined
                        })
                      }
                    />
                    <Select
                      size="xs"
                      label="Join"
                      data={['sum', 'average', 'minimum', 'manualWeights', 'relativeScore']}
                      value={req.multiTarget?.join ?? 'average'}
                      disabled={!req.multiTarget?.targets.length}
                      onChange={(v) =>
                        patch({
                          multiTarget: req.multiTarget
                            ? { ...req.multiTarget, join: (v as never) ?? 'average' }
                            : undefined
                        })
                      }
                    />
                  </Group>
                </>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {req.type === 'nearText' && (
        <Accordion.Item value="move">
          <Accordion.Control>
            <Text size="sm">Concept steering</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Group grow align="end">
                <TextInput
                  size="xs"
                  label="Move toward"
                  placeholder="concepts, comma separated"
                  value={req.moveTo?.concepts.join(', ') ?? ''}
                  onChange={(e) => {
                    const concepts = e.currentTarget.value
                      .split(',')
                      .map((c) => c.trim())
                      .filter(Boolean)
                    patch({
                      moveTo: concepts.length
                        ? { concepts, force: req.moveTo?.force ?? 0.5 }
                        : undefined
                    })
                  }}
                />
                <NumberInput
                  size="xs"
                  label="Force"
                  min={0}
                  max={1}
                  step={0.1}
                  value={req.moveTo?.force ?? 0.5}
                  disabled={!req.moveTo}
                  onChange={(v) =>
                    patch({ moveTo: req.moveTo ? { ...req.moveTo, force: Number(v) } : undefined })
                  }
                />
              </Group>
              <Group grow align="end">
                <TextInput
                  size="xs"
                  label="Move away from"
                  placeholder="concepts, comma separated"
                  value={req.moveAway?.concepts.join(', ') ?? ''}
                  onChange={(e) => {
                    const concepts = e.currentTarget.value
                      .split(',')
                      .map((c) => c.trim())
                      .filter(Boolean)
                    patch({
                      moveAway: concepts.length
                        ? { concepts, force: req.moveAway?.force ?? 0.5 }
                        : undefined
                    })
                  }}
                />
                <NumberInput
                  size="xs"
                  label="Force"
                  min={0}
                  max={1}
                  step={0.1}
                  value={req.moveAway?.force ?? 0.5}
                  disabled={!req.moveAway}
                  onChange={(v) =>
                    patch({
                      moveAway: req.moveAway ? { ...req.moveAway, force: Number(v) } : undefined
                    })
                  }
                />
              </Group>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {isKeyword && (
        <Accordion.Item value="keyword">
          <Accordion.Control>
            <Text size="sm">Keyword scoring</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <MultiSelect
                size="xs"
                label="Search these properties only"
                description="Add ^2 style weights below"
                data={properties}
                value={(req.queryProperties ?? []).map((p) => p.property)}
                onChange={(v) =>
                  patch({
                    queryProperties: v.map((property) => ({
                      property,
                      weight: req.queryProperties?.find((p) => p.property === property)?.weight
                    }))
                  })
                }
              />
              {(req.queryProperties ?? []).map((p, i) => (
                <Group key={p.property} gap="xs">
                  <Text size="xs" w={150} truncate>
                    {p.property}
                  </Text>
                  <NumberInput
                    size="xs"
                    w={110}
                    min={0.1}
                    step={0.5}
                    decimalScale={2}
                    placeholder="weight"
                    value={p.weight ?? 1}
                    onChange={(v) =>
                      patch({
                        queryProperties: (req.queryProperties ?? []).map((x, idx) =>
                          idx === i ? { ...x, weight: Number(v) } : x
                        )
                      })
                    }
                  />
                </Group>
              ))}
              <Group grow align="end">
                <Select
                  size="xs"
                  label="Term operator"
                  clearable
                  data={[
                    { value: 'or', label: 'OR — any term' },
                    { value: 'and', label: 'AND — every term' }
                  ]}
                  value={req.bm25Operator?.operator ?? null}
                  onChange={(v) =>
                    patch({
                      bm25Operator: v
                        ? { operator: v as 'and' | 'or', minimumMatch: req.bm25Operator?.minimumMatch }
                        : undefined
                    })
                  }
                />
                <NumberInput
                  size="xs"
                  label="Minimum matching terms"
                  min={1}
                  disabled={req.bm25Operator?.operator !== 'or'}
                  value={req.bm25Operator?.minimumMatch ?? 1}
                  onChange={(v) =>
                    patch({
                      bm25Operator: req.bm25Operator
                        ? { ...req.bm25Operator, minimumMatch: Number(v) }
                        : undefined
                    })
                  }
                />
              </Group>
              {req.type === 'hybrid' && (
                <Group grow align="end">
                  <Select
                    size="xs"
                    label="Fusion"
                    clearable
                    data={['Ranked', 'RelativeScore']}
                    value={req.fusionType ?? null}
                    onChange={(v) => patch({ fusionType: (v as 'Ranked' | 'RelativeScore') ?? undefined })}
                  />
                  <NumberInput
                    size="xs"
                    label="Max vector distance"
                    step={0.05}
                    decimalScale={4}
                    value={req.maxVectorDistance ?? ''}
                    onChange={(v) => patch({ maxVectorDistance: v === '' ? undefined : Number(v) })}
                  />
                </Group>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      <Accordion.Item value="grouping">
        <Accordion.Control>
          <Text size="sm">Grouping, reranking &amp; sorting</Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <Group grow align="end">
              <Select
                size="xs"
                label="Group by"
                clearable
                searchable
                data={properties}
                value={req.groupBy?.property ?? null}
                onChange={(v) =>
                  patch({
                    groupBy: v
                      ? {
                          property: v,
                          numberOfGroups: req.groupBy?.numberOfGroups ?? 5,
                          objectsPerGroup: req.groupBy?.objectsPerGroup ?? 3
                        }
                      : undefined
                  })
                }
              />
              <NumberInput
                size="xs"
                label="Groups"
                min={1}
                disabled={!req.groupBy}
                value={req.groupBy?.numberOfGroups ?? 5}
                onChange={(v) =>
                  patch({
                    groupBy: req.groupBy ? { ...req.groupBy, numberOfGroups: Number(v) } : undefined
                  })
                }
              />
              <NumberInput
                size="xs"
                label="Per group"
                min={1}
                disabled={!req.groupBy}
                value={req.groupBy?.objectsPerGroup ?? 3}
                onChange={(v) =>
                  patch({
                    groupBy: req.groupBy ? { ...req.groupBy, objectsPerGroup: Number(v) } : undefined
                  })
                }
              />
            </Group>

            <Group grow align="end">
              <Select
                size="xs"
                label="Rerank on property"
                description={hasReranker ? undefined : 'No reranker module on this collection'}
                clearable
                searchable
                disabled={!hasReranker}
                data={properties}
                value={req.rerank?.property ?? null}
                onChange={(v) =>
                  patch({ rerank: v ? { property: v, query: req.rerank?.query } : undefined })
                }
              />
              <TextInput
                size="xs"
                label="Rerank query"
                placeholder="defaults to the search text"
                disabled={!req.rerank}
                value={req.rerank?.query ?? ''}
                onChange={(e) =>
                  patch({
                    rerank: req.rerank ? { ...req.rerank, query: e.currentTarget.value } : undefined
                  })
                }
              />
            </Group>

            {req.type === 'fetch' && (
              <SortEditor
                sort={req.sort ?? []}
                properties={properties}
                onChange={(sort) => patch({ sort })}
              />
            )}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  )
}
