// Normalize arbitrary client return values into plain, structured-clone-safe
// data before sending across IPC. A JSON round-trip drops functions/class
// instances and converts Dates to ISO strings, which is acceptable for display.
export function normalizeForIpc<T = unknown>(value: unknown): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  ) as T
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}
