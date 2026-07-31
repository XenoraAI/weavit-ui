import { Stack, Group, Select, TextInput, ActionIcon, Button, Text } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { FilterCondition, FilterOperator } from '@shared/types'

const OPERATORS: FilterOperator[] = [
  'Equal',
  'NotEqual',
  'GreaterThan',
  'GreaterThanEqual',
  'LessThan',
  'LessThanEqual',
  'Like',
  'ContainsAny',
  'ContainsAll'
]

const VALUE_TYPES = ['text', 'int', 'number', 'boolean']

interface Props {
  value: FilterCondition[]
  onChange: (v: FilterCondition[]) => void
  properties: string[]
}

export function FilterBuilder({ value, onChange, properties }: Props) {
  const update = (i: number, patch: Partial<FilterCondition>) =>
    onChange(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const add = () =>
    onChange([...value, { property: properties[0] ?? '', operator: 'Equal', value: '', valueType: 'text' }])
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          Filters {value.length > 0 && `(${value.length})`}
        </Text>
        <Button size="compact-xs" variant="light" leftSection={<IconPlus size={13} />} onClick={add}>
          Add
        </Button>
      </Group>
      {value.map((c, i) => (
        <Group key={i} gap="xs" wrap="nowrap" align="end">
          <Select
            size="xs"
            placeholder="property"
            searchable
            data={properties}
            value={c.property}
            onChange={(v) => update(i, { property: v ?? '' })}
            w={150}
          />
          <Select
            size="xs"
            data={OPERATORS}
            value={c.operator}
            onChange={(v) => update(i, { operator: v as FilterOperator })}
            w={150}
          />
          <TextInput
            size="xs"
            placeholder="value"
            value={c.value}
            onChange={(e) => update(i, { value: e.currentTarget.value })}
            style={{ flex: 1 }}
          />
          <Select
            size="xs"
            data={VALUE_TYPES}
            value={c.valueType}
            onChange={(v) => update(i, { valueType: (v as FilterCondition['valueType']) ?? 'text' })}
            w={90}
          />
          <ActionIcon color="red" variant="subtle" onClick={() => remove(i)}>
            <IconTrash size={15} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  )
}
