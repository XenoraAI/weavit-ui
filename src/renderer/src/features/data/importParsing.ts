import type { ImportObject } from '@shared/types'

// Turning a user-supplied file into objects to insert. Kept apart from the
// modal so the parsing is testable without a renderer environment.

export type ImportFormat = 'json' | 'jsonl' | 'csv'

/** Splits a CSV line, honouring quoted fields and doubled quotes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(current)
      current = ''
    } else current += ch
  }
  out.push(current)
  return out
}

/** CSV cells arrive as strings; recover the obvious JSON-ish types. */
function coerceCell(raw: string): unknown {
  const t = raw.trim()
  if (t === '') return null
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t)
    } catch {
      // A cell that merely looks like JSON shouldn't fail the whole row.
      return raw
    }
  }
  return raw
}

/** `_id` / `id` columns become the object's UUID rather than a property. */
const ID_COLUMNS = new Set(['_id', 'id', 'uuid', '_uuid'])

/** Both a bare properties object and the shape Export produces are accepted. */
function fromJsonEntry(entry: unknown): ImportObject {
  if (entry && typeof entry === 'object' && 'properties' in entry) {
    const e = entry as Record<string, unknown>
    return {
      properties: (e.properties ?? {}) as Record<string, unknown>,
      id: typeof e.id === 'string' ? e.id : typeof e.uuid === 'string' ? e.uuid : undefined,
      vectors: e.vectors as Record<string, number[]> | undefined
    }
  }
  return { properties: (entry ?? {}) as Record<string, unknown> }
}

export function parseImport(text: string, format: ImportFormat): ImportObject[] {
  if (format === 'json') {
    const parsed = JSON.parse(text)
    return (Array.isArray(parsed) ? parsed : [parsed]).map(fromJsonEntry)
  }

  if (format === 'jsonl') {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => fromJsonEntry(JSON.parse(line)))
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row')
  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    const properties: Record<string, unknown> = {}
    let id: string | undefined
    header.forEach((key, i) => {
      const value = cells[i] ?? ''
      if (ID_COLUMNS.has(key)) {
        if (value.trim()) id = value.trim()
        return
      }
      properties[key] = coerceCell(value)
    })
    return { properties, id }
  })
}
