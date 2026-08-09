// One property as the UI edits it, plus the conversion to Weaviate's property
// JSON. Shared by the create and edit dialogs so both offer the same options
// and produce the same shape.

import { isTextType } from './schemaOptions'

export interface PropertyDraft {
  name: string
  dataType: string
  description: string
  tokenization: string
  indexFilterable: boolean
  indexSearchable: boolean
}

export const newPropertyDraft = (): PropertyDraft => ({
  name: '',
  dataType: 'text',
  description: '',
  tokenization: 'word',
  indexFilterable: true,
  indexSearchable: true
})

const base = (dataType: string): string => dataType.replace(/\[\]$/, '')

// Per the inverted-index reference, indexFilterable applies to everything
// except these types (and arrays of them); indexSearchable is text-only.
// Sending the flag on an unsupported type is a schema validation error.
const NOT_FILTERABLE = new Set(['blob', 'geoCoordinates', 'object', 'phoneNumber'])

export const supportsFilterable = (dataType: string): boolean =>
  !NOT_FILTERABLE.has(base(dataType))

export const supportsSearchable = (dataType: string): boolean => isTextType(dataType)

export const supportsTokenization = (dataType: string): boolean => isTextType(dataType)

/** Weaviate property JSON; keys that don't apply to the data type are omitted. */
export function toPropertyDefinition(draft: PropertyDraft): Record<string, unknown> {
  const def: Record<string, unknown> = {
    name: draft.name.trim(),
    dataType: [draft.dataType]
  }
  if (draft.description.trim()) def.description = draft.description.trim()
  if (supportsTokenization(draft.dataType)) def.tokenization = draft.tokenization
  if (supportsFilterable(draft.dataType)) def.indexFilterable = draft.indexFilterable
  if (supportsSearchable(draft.dataType)) def.indexSearchable = draft.indexSearchable
  return def
}

/**
 * Names that appear more than once (case-insensitively), so both the create
 * dialog's rows and the edit dialog's new-property field can flag them before
 * Weaviate does.
 */
export function duplicateNames(names: string[]): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const raw of names) {
    const key = raw.trim().toLowerCase()
    if (!key) continue
    if (seen.has(key)) dupes.add(key)
    seen.add(key)
  }
  return dupes
}
