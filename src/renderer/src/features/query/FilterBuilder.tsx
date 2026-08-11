import { Stack, Group, Select, TextInput, ActionIcon, Button, Text, Paper, Tooltip } from '@mantine/core'
import { IconPlus, IconTrash, IconFolderPlus } from '@tabler/icons-react'
import type {
  FilterCondition,
  FilterGroup,
  FilterNode,
  FilterOperator,
  FilterTarget,
  FilterValueType,
  ReferenceConfig
} from '@shared/types'

const OPERATORS: FilterOperator[] = [
  'Equal',
  'NotEqual',
  'GreaterThan',
  'GreaterThanEqual',
  'LessThan',
  'LessThanEqual',
  'Like',
  'ContainsAny',
  'ContainsAll',
  'IsNull',
  'WithinGeoRange'
]

const TARGETS: { value: FilterTarget; label: string }[] = [
  { value: 'property', label: 'property' },
  { value: 'propertyLength', label: 'length of' },
  { value: 'id', label: 'object id' },
  { value: 'creationTime', label: 'created' },
  { value: 'updateTime', label: 'updated' },
  { value: 'referenceCount', label: 'ref count' }
]

const COUNT_OPERATORS: FilterOperator[] = [
  'Equal',
  'NotEqual',
  'GreaterThan',
  'GreaterThanEqual',
  'LessThan',
  'LessThanEqual'
]

const VALUE_TYPES: FilterValueType[] = ['text', 'int', 'number', 'boolean', 'date', 'uuid']

/** Operators each target actually supports, mirroring the client's builders. */
const TARGET_OPERATORS: Record<FilterTarget, FilterOperator[]> = {
  property: OPERATORS,
  propertyLength: [
    'Equal',
    'NotEqual',
    'GreaterThan',
    'GreaterThanEqual',
    'LessThan',
    'LessThanEqual'
  ],
  id: ['Equal', 'NotEqual', 'ContainsAny'],
  creationTime: [
    'Equal',
    'NotEqual',
    'ContainsAny',
    'GreaterThan',
    'GreaterThanEqual',
    'LessThan',
    'LessThanEqual'
  ],
  updateTime: [
    'Equal',
    'NotEqual',
    'ContainsAny',
    'GreaterThan',
    'GreaterThanEqual',
    'LessThan',
    'LessThanEqual'
  ],
  referenceCount: COUNT_OPERATORS
}

const PLACEHOLDER: Partial<Record<FilterOperator, string>> = {
  ContainsAny: 'a, b, c',
  ContainsAll: 'a, b, c',
  IsNull: 'true',
  WithinGeoRange: 'lat, lon, metres',
  Like: 'acme*'
}

function isGroup(node: FilterNode): node is FilterGroup {
  return (node as FilterGroup).kind === 'group'
}

function newCondition(properties: string[]): FilterCondition {
  return {
    kind: 'condition',
    property: properties[0] ?? '',
    target: 'property',
    operator: 'Equal',
    value: '',
    valueType: 'text'
  }
}

function newGroup(properties: string[]): FilterGroup {
  return { kind: 'group', operator: 'Or', children: [newCondition(properties)] }
}

interface RowProps {
  node: FilterNode
  properties: string[]
  references: ReferenceConfig[]
  depth: number
  onChange: (node: FilterNode) => void
  onRemove: () => void
}

function FilterRow({ node, properties, references, depth, onChange, onRemove }: RowProps) {
  if (isGroup(node)) {
    const update = (i: number, child: FilterNode) =>
      onChange({ ...node, children: node.children.map((c, idx) => (idx === i ? child : c)) })
    const remove = (i: number) =>
      onChange({ ...node, children: node.children.filter((_, idx) => idx !== i) })

    return (
      <Paper withBorder p="xs" radius="sm" bg="var(--mantine-color-dark-8)">
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <Select
              size="xs"
              w={80}
              data={['And', 'Or']}
              value={node.operator}
              onChange={(v) => onChange({ ...node, operator: (v as 'And' | 'Or') ?? 'Or' })}
            />
            <Text size="xs" c="dimmed">
              match {node.operator === 'Or' ? 'any' : 'all'} of
            </Text>
          </Group>
          <Group gap={4}>
            <Tooltip label="Add condition">
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={() => onChange({ ...node, children: [...node.children, newCondition(properties)] })}
              >
                <IconPlus size={14} />
              </ActionIcon>
            </Tooltip>
            {/* Three levels is already more nesting than a UI form can show
                clearly; past that the raw GraphQL console is the better tool. */}
            {depth < 2 && (
              <Tooltip label="Add nested group">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={() => onChange({ ...node, children: [...node.children, newGroup(properties)] })}
                >
                  <IconFolderPlus size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            <ActionIcon size="sm" color="red" variant="subtle" onClick={onRemove}>
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        </Group>
        <Stack gap="xs">
          {node.children.map((child, i) => (
            <FilterRow
              key={i}
              node={child}
              properties={properties}
              references={references}
              depth={depth + 1}
              onChange={(c) => update(i, c)}
              onRemove={() => remove(i)}
            />
          ))}
        </Stack>
      </Paper>
    )
  }

  const target = node.target ?? 'property'
  const allowed = TARGET_OPERATORS[target]
  const needsProperty =
    target === 'property' || target === 'propertyLength' || target === 'referenceCount'
  const needsValueType = target === 'property' && node.operator !== 'IsNull'

  // One hop is all the form offers; the request shape allows deeper chains.
  const hop = (node.referencePath ?? [])[0]
  const hopConfig = references.find((r) => r.name === hop?.property)
  // A reference that points at several collections is ambiguous until one is named.
  const hopTargets = hopConfig?.targetCollections ?? []

  const patch = (p: Partial<FilterCondition>) => onChange({ ...node, ...p })

  /**
   * Switching the hop invalidates the property, which belonged to the old
   * collection. The target collection is filled in whenever the schema leaves
   * no choice — aggregation refuses a reference filter that doesn't name one.
   */
  const setHop = (name: string | null) => {
    if (!name) return patch({ referencePath: undefined, property: '' })
    const targets = references.find((r) => r.name === name)?.targetCollections ?? []
    patch({
      referencePath: [
        { property: name, targetCollection: targets.length === 1 ? targets[0] : undefined }
      ],
      property: ''
    })
  }

  return (
    <Group gap="xs" wrap="nowrap" align="end">
      <Select
        size="xs"
        data={TARGETS}
        value={target}
        onChange={(v) => {
          const next = (v as FilterTarget) ?? 'property'
          // Switching target can strand an operator the new target rejects.
          const operator = TARGET_OPERATORS[next].includes(node.operator)
            ? node.operator
            : TARGET_OPERATORS[next][0]
          patch({ target: next, operator })
        }}
        w={110}
      />
      {references.length > 0 && (
        <Select
          size="xs"
          placeholder="on this object"
          title="Filter on a referenced object instead of this one"
          clearable
          data={references.map((r) => ({
            value: r.name,
            label: `via ${r.name}`
          }))}
          value={hop?.property ?? null}
          onChange={setHop}
          w={140}
        />
      )}
      {hopTargets.length > 1 && (
        <Select
          size="xs"
          placeholder="target"
          title="Which collection this reference points at"
          data={hopTargets}
          value={hop?.targetCollection ?? null}
          onChange={(v) =>
            patch({
              referencePath: [{ property: hop!.property, targetCollection: v ?? undefined }]
            })
          }
          w={130}
        />
      )}
      {needsProperty &&
        // Past a hop we are in another collection, whose schema we don't hold
        // here, so the name is typed rather than picked.
        (hop ? (
          <TextInput
            size="xs"
            placeholder={
              target === 'referenceCount'
                ? `reference in ${hopTargets[0] ?? 'target'}`
                : `property in ${hop.targetCollection ?? hopTargets[0] ?? 'target'}`
            }
            value={node.property}
            onChange={(e) => patch({ property: e.currentTarget.value })}
            w={150}
          />
        ) : (
          <Select
            size="xs"
            placeholder={target === 'referenceCount' ? 'reference' : 'property'}
            searchable
            data={target === 'referenceCount' ? references.map((r) => r.name) : properties}
            value={node.property}
            onChange={(v) => patch({ property: v ?? '' })}
            w={150}
          />
        ))}
      <Select
        size="xs"
        data={allowed}
        value={node.operator}
        onChange={(v) => patch({ operator: v as FilterOperator })}
        w={150}
      />
      <TextInput
        size="xs"
        placeholder={PLACEHOLDER[node.operator] ?? 'value'}
        value={node.value}
        onChange={(e) => patch({ value: e.currentTarget.value })}
        style={{ flex: 1 }}
      />
      {needsValueType && (
        <Select
          size="xs"
          data={VALUE_TYPES}
          value={node.valueType}
          onChange={(v) => patch({ valueType: (v as FilterValueType) ?? 'text' })}
          w={90}
        />
      )}
      <ActionIcon color="red" variant="subtle" onClick={onRemove}>
        <IconTrash size={15} />
      </ActionIcon>
    </Group>
  )
}

interface Props {
  value: FilterNode[]
  onChange: (v: FilterNode[]) => void
  properties: string[]
  /** Cross-references, so conditions can reach into the referenced objects. */
  references?: ReferenceConfig[]
}

/** Counts leaf conditions so the header reflects real filters, not groups. */
function countConditions(nodes: FilterNode[]): number {
  return nodes.reduce(
    (sum, n) => sum + (isGroup(n) ? countConditions(n.children) : 1),
    0
  )
}

export function FilterBuilder({ value, onChange, properties, references = [] }: Props) {
  const count = countConditions(value)

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          Filters {count > 0 && `(${count})`}
          {value.length > 1 && (
            <Text span size="xs" c="dimmed">
              {' '}
              — combined with AND
            </Text>
          )}
        </Text>
        <Group gap={4}>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconPlus size={13} />}
            onClick={() => onChange([...value, newCondition(properties)])}
          >
            Condition
          </Button>
          <Button
            size="compact-xs"
            variant="light"
            color="gray"
            leftSection={<IconFolderPlus size={13} />}
            onClick={() => onChange([...value, newGroup(properties)])}
          >
            OR group
          </Button>
        </Group>
      </Group>
      {value.map((node, i) => (
        <FilterRow
          key={i}
          node={node}
          properties={properties}
          references={references}
          depth={0}
          onChange={(n) => onChange(value.map((c, idx) => (idx === i ? n : c)))}
          onRemove={() => onChange(value.filter((_, idx) => idx !== i))}
        />
      ))}
    </Stack>
  )
}
