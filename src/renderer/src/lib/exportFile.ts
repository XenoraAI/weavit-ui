import type { WeaviateObject } from '@shared/types'

// Turning result sets into files the user can hand to something else. Runs
// entirely in the renderer — the data is already here, so there is no reason to
// round-trip it through main just to write bytes.

/** Escapes one CSV field per RFC 4180. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/** Every property key across the given objects, in first-seen order. */
export function columnsOf(objects: WeaviateObject[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const o of objects) {
    for (const k of Object.keys(o.properties)) {
      if (!seen.has(k)) {
        seen.add(k)
        keys.push(k)
      }
    }
  }
  return keys
}

export function toCsv(objects: WeaviateObject[], includeVectors = false): string {
  const columns = columnsOf(objects)
  const header = ['_id', ...columns, ...(includeVectors ? ['_vectors'] : [])]
  const rows = objects.map((o) => [
    csvCell(o.uuid),
    ...columns.map((c) => csvCell(o.properties[c])),
    ...(includeVectors ? [csvCell(o.vectors)] : [])
  ])
  return [header.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n')
}

export function toJson(objects: WeaviateObject[]): string {
  return JSON.stringify(objects, null, 2)
}

/** One JSON object per line — the format the importer round-trips best. */
export function toJsonl(objects: WeaviateObject[]): string {
  return objects
    .map((o) => JSON.stringify({ id: o.uuid, properties: o.properties, vectors: o.vectors }))
    .join('\n')
}

/** Hands the browser a blob to save. Chromium in Electron handles the rest. */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can race the download in Chromium; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Reads a user-picked file as text via a transient <input type=file>. */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => resolve({ name: file.name, text: String(reader.result ?? '') })
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Reads a user-picked binary file as base64, for image/media search. */
export function pickBinaryFile(accept: string): Promise<{ name: string; base64: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result ?? '')
        const comma = result.indexOf(',')
        resolve({ name: file.name, base64: comma > -1 ? result.slice(comma + 1) : result })
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
