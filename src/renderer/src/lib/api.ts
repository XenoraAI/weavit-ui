import type { WeftApi } from '@shared/types'

// The preload bridge. All Weaviate access in the renderer goes through this.
export const api: WeftApi = window.api

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return String(e)
}
