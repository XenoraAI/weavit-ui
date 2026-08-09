// Reading and diffing the mutable parts of a Weaviate class definition.
// Kept free of React so it can be unit-tested directly.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Mutable settings, flattened so we can diff against what the server returned. */
export interface Settings {
  description: string
  bm25b: number | ''
  bm25k1: number | ''
  cleanupIntervalSeconds: number | ''
  ef: number | ''
  dynamicEfMin: number | ''
  dynamicEfMax: number | ''
  dynamicEfFactor: number | ''
  flatSearchCutoff: number | ''
  vectorCacheMaxObjects: number | ''
  filterStrategy: string
  autoTenantCreation: boolean
  autoTenantActivation: boolean
}

export const EMPTY_SETTINGS: Settings = {
  description: '',
  bm25b: '',
  bm25k1: '',
  cleanupIntervalSeconds: '',
  ef: '',
  dynamicEfMin: '',
  dynamicEfMax: '',
  dynamicEfFactor: '',
  flatSearchCutoff: '',
  vectorCacheMaxObjects: '',
  filterStrategy: '',
  autoTenantCreation: false,
  autoTenantActivation: false
}

const num = (v: unknown): number | '' => (typeof v === 'number' ? v : '')

export function readSettings(cls: any): Settings {
  const inverted = cls?.invertedIndexConfig ?? {}
  const vec = cls?.vectorIndexConfig ?? {}
  const mt = cls?.multiTenancyConfig ?? {}
  return {
    description: cls?.description ?? '',
    bm25b: num(inverted?.bm25?.b),
    bm25k1: num(inverted?.bm25?.k1),
    cleanupIntervalSeconds: num(inverted?.cleanupIntervalSeconds),
    ef: num(vec?.ef),
    dynamicEfMin: num(vec?.dynamicEfMin),
    dynamicEfMax: num(vec?.dynamicEfMax),
    dynamicEfFactor: num(vec?.dynamicEfFactor),
    flatSearchCutoff: num(vec?.flatSearchCutoff),
    vectorCacheMaxObjects: num(vec?.vectorCacheMaxObjects),
    filterStrategy: typeof vec?.filterStrategy === 'string' ? vec.filterStrategy : '',
    autoTenantCreation: Boolean(mt?.autoTenantCreation),
    autoTenantActivation: Boolean(mt?.autoTenantActivation)
  }
}

const VECTOR_KEYS = [
  'ef',
  'dynamicEfMin',
  'dynamicEfMax',
  'dynamicEfFactor',
  'flatSearchCutoff',
  'vectorCacheMaxObjects'
] as const

/**
 * Builds a patch of only what changed. Sending untouched config back would push
 * settings the collection may not even have (e.g. a top-level vectorIndexConfig
 * on a named-vector collection), which Weaviate rejects.
 */
export function buildPatch(initial: Settings, current: Settings): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const changed = <K extends keyof Settings>(k: K): boolean => initial[k] !== current[k]

  if (changed('description')) patch.description = current.description

  const bm25: Record<string, unknown> = {}
  if (changed('bm25b') && current.bm25b !== '') bm25.b = current.bm25b
  if (changed('bm25k1') && current.bm25k1 !== '') bm25.k1 = current.bm25k1
  const inverted: Record<string, unknown> = {}
  if (Object.keys(bm25).length) inverted.bm25 = bm25
  if (changed('cleanupIntervalSeconds') && current.cleanupIntervalSeconds !== '') {
    inverted.cleanupIntervalSeconds = current.cleanupIntervalSeconds
  }
  if (Object.keys(inverted).length) patch.invertedIndexConfig = inverted

  const vec: Record<string, unknown> = {}
  for (const k of VECTOR_KEYS) {
    if (changed(k) && current[k] !== '') vec[k] = current[k]
  }
  if (changed('filterStrategy') && current.filterStrategy) {
    vec.filterStrategy = current.filterStrategy
  }
  if (Object.keys(vec).length) patch.vectorIndexConfig = vec

  const mt: Record<string, unknown> = {}
  if (changed('autoTenantCreation')) mt.autoTenantCreation = current.autoTenantCreation
  if (changed('autoTenantActivation')) mt.autoTenantActivation = current.autoTenantActivation
  if (Object.keys(mt).length) patch.multiTenancyConfig = mt

  return patch
}
