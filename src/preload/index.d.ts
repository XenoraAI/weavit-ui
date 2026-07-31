import type { WeftApi } from '@shared/types'

declare global {
  interface Window {
    api: WeftApi
  }
}

export {}
