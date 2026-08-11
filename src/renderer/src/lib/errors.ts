// Errors reach the renderer as strings: Electron rejects an invoke with the
// message only, prefixed by the channel it came from, and the Weaviate client
// stringifies its own class name and the whole HTTP body into that message.
// None of that belongs in front of a user, so it gets peeled off here.

const IPC_PREFIX = /^Error(?::\s*)?\s*invoking remote method '[^']*':\s*/
const CLIENT_CLASS_PREFIX = /^Weaviate[A-Za-z]*Error:\s*/
const STATUS_CODE_WRAPPER =
  /^The request to Weaviate failed with status code:\s*(\d+)\s*and message:\s*([\s\S]*)$/
/** The client's own wrapper for a 403, around a body of any shape. */
const FORBIDDEN_PREFIX = /^Forbidden:\s*/

/**
 * The sentence Weaviate sends when RBAC refuses a call. It arrives in several
 * wrappers — bare, JSON-encoded, or repeated inside a `msg:… code:403 err:…`
 * envelope — so match it wherever it sits rather than anchoring to the start.
 */
const RBAC_DENIAL = /user '([^']+)' has insufficient permissions to (\w+)(?:\s*\[\[([^\]]*)\]\])?/
/** The denial's bracketed detail names the collection it was scoped to. */
const DENIAL_COLLECTION = /\bCollection:\s*([^,\]]+)/

/**
 * Rewrites an RBAC refusal as a sentence about the caller. The raw form names
 * the action twice and carries the internal domain/object tuple, none of which
 * helps someone decide what to do next: what they need is who they are, what
 * they were denied, and where.
 */
export function rbacDenial(message: string): string | undefined {
  const denial = RBAC_DENIAL.exec(message)
  if (!denial) return undefined
  const [, user, action, detail] = denial
  const collection = detail ? DENIAL_COLLECTION.exec(detail)?.[1]?.trim() : undefined
  const scope = collection && collection !== '*' ? ` on ${collection}` : ''
  return `User '${user}' lacks permission to ${action}${scope}.`
}

/** `{"code":405,"message":"…"}` and `{"error":[{"message":"…"}]}` both occur. */
function serverMessage(body: string): string | undefined {
  const trimmed = body.trim()
  if (!trimmed) return undefined
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'string') return parsed
    if (typeof parsed?.message === 'string') return parsed.message
    if (Array.isArray(parsed?.error)) {
      const parts = parsed.error.map((e: { message?: string }) => e?.message).filter(Boolean)
      if (parts.length) return parts.join('; ')
    }
    return undefined
  } catch {
    return trimmed
  }
}

/** Turn a raw thrown value into a single sentence worth showing. */
export function errMsg(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : String(e)
  const stripped = raw.replace(IPC_PREFIX, '').replace(CLIENT_CLASS_PREFIX, '').trim()

  // Checked before the wrappers below: a denial reads the same whether it came
  // back bare, as a status-code body, or as a Forbidden payload.
  const denial = rbacDenial(stripped)
  if (denial) return denial

  const status = stripped.match(STATUS_CODE_WRAPPER)
  if (status) {
    const detail = serverMessage(status[2])
    return detail ? `Weaviate returned ${status[1]}: ${detail}` : `Weaviate returned ${status[1]}`
  }

  if (FORBIDDEN_PREFIX.test(stripped)) {
    const detail = serverMessage(stripped.replace(FORBIDDEN_PREFIX, ''))
    return detail ? `Forbidden: ${detail}` : 'Forbidden'
  }
  return stripped || 'Unknown error'
}
