import { Stack, Group, TextInput, Select, Switch } from '@mantine/core'
import { DATA_TYPES, TOKENIZATIONS } from './schemaOptions'
import {
  supportsFilterable,
  supportsSearchable,
  supportsTokenization,
  type PropertyDraft
} from './propertyDraft'

interface Props {
  value: PropertyDraft
  onChange: (patch: Partial<PropertyDraft>) => void
  nameError?: string
  autoFocus?: boolean
}

/**
 * The property editor used by both the create and edit dialogs. Options that
 * don't apply to the selected data type are hidden rather than disabled, since
 * Weaviate rejects them outright.
 */
export function PropertyFields({ value, onChange, nameError, autoFocus }: Props) {
  return (
    <Stack gap="xs">
      <Group grow align="flex-start">
        <TextInput
          label="Name"
          placeholder="title"
          value={value.name}
          onChange={(e) => onChange({ name: e.currentTarget.value })}
          error={nameError}
          data-autofocus={autoFocus || undefined}
        />
        <Select
          label="Data type"
          data={DATA_TYPES}
          value={value.dataType}
          onChange={(v) => onChange({ dataType: v ?? 'text' })}
        />
      </Group>
      <TextInput
        label="Description (optional)"
        value={value.description}
        onChange={(e) => onChange({ description: e.currentTarget.value })}
      />
      {supportsTokenization(value.dataType) && (
        <Select
          label="Tokenization"
          data={TOKENIZATIONS}
          value={value.tokenization}
          onChange={(v) => onChange({ tokenization: v ?? 'word' })}
        />
      )}
      {(supportsFilterable(value.dataType) || supportsSearchable(value.dataType)) && (
        <Group>
          {supportsFilterable(value.dataType) && (
            <Switch
              label="Filterable"
              checked={value.indexFilterable}
              onChange={(e) => onChange({ indexFilterable: e.currentTarget.checked })}
            />
          )}
          {supportsSearchable(value.dataType) && (
            <Switch
              label="Searchable (BM25)"
              checked={value.indexSearchable}
              onChange={(e) => onChange({ indexSearchable: e.currentTarget.checked })}
            />
          )}
        </Group>
      )}
    </Stack>
  )
}
