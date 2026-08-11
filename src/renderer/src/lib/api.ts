import type { WeftApi } from '@shared/types'

// The preload bridge. All Weaviate access in the renderer goes through this.
export const api: WeftApi = window.api

export { errMsg } from './errors'
