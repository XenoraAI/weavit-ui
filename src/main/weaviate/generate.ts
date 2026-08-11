import { generativeParameters } from 'weaviate-client'
import { getClient } from './connectionManager'
import { mapObject } from './data'
import { mapGroups } from './query'
import { buildSearchOptions, callOptions, dispatchSearch, scopeCollection } from './searchOptions'
import type { GenerateRequest, GenerateResult, GenerativeUsage } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Retrieval-augmented generation. Retrieval is an ordinary search; the only
// additions are the prompts. `singlePrompt` runs once per returned object and
// can interpolate that object's properties with {braces}; `groupedTask` runs
// once over the whole result set.

/**
 * Providers disagree on what the "where do I reach you" field is called, so a
 * single `baseUrl` in the request lands on the right key per provider.
 */
const ENDPOINT_FIELD: Record<string, string> = {
  aws: 'endpoint',
  databricks: 'endpoint',
  google: 'apiEndpoint',
  ollama: 'apiEndpoint'
}

/**
 * Only these providers accept stop sequences, and they disagree on the name.
 * A provider absent from this map gets none — sending a key its factory does
 * not destructure just drops it silently on the wire.
 */
const STOP_FIELD: Record<string, string> = {
  anthropic: 'stopSequences',
  azureOpenAI: 'stop',
  cohere: 'stopSequences',
  databricks: 'stop',
  google: 'stopSequences',
  openAI: 'stop'
}

/**
 * Turns the request's provider fields into the client's runtime generative
 * config. Returning undefined leaves the decision to the collection's own
 * `moduleConfig`, which is the behaviour when no provider is chosen.
 */
export function buildGenerativeConfig(req: GenerateRequest): any | undefined {
  const provider = req.provider
  if (!provider) return undefined

  const factory = (generativeParameters as any)[provider]
  if (typeof factory !== 'function') {
    throw new Error(`Unknown generative provider: ${provider}`)
  }

  const config: any = {}
  const model = req.model?.trim()
  if (model) config.model = model
  // 0 is meaningful for every one of these, so test the type rather than truthiness.
  if (isNum(req.temperature)) config.temperature = req.temperature
  if (isNum(req.maxTokens)) config.maxTokens = req.maxTokens
  if (isNum(req.topP)) config.topP = req.topP
  const stop = (req.stop ?? []).map((s) => s.trim()).filter(Boolean)
  if (stop.length && STOP_FIELD[provider]) config[STOP_FIELD[provider]] = stop
  const baseUrl = req.baseUrl?.trim()
  if (baseUrl) config[ENDPOINT_FIELD[provider] ?? 'baseURL'] = baseUrl

  if (provider === 'azureOpenAI') {
    // Azure names a deployment, not a model, and the module rejects a partial
    // triple with a confusing 500 — fail here where we can say which is missing.
    const missing = (['resourceName', 'deploymentId'] as const).filter((k) => !req[k]?.trim())
    if (missing.length) {
      throw new Error(`Azure OpenAI needs ${missing.join(' and ')}`)
    }
    config.resourceName = req.resourceName?.trim()
    config.deploymentId = req.deploymentId?.trim()
    const apiVersion = req.apiVersion?.trim()
    if (apiVersion) config.apiVersion = apiVersion
  }

  return factory(config)
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Groups carry their own generation, which the plain search mapper drops. */
function mapGeneratedGroups(raw: any): GenerateResult['groups'] {
  const groups = mapGroups(raw)
  if (!groups) return undefined
  const source = raw?.groups
  const values: any[] = Array.isArray(source) ? source : Object.values(source ?? {})
  return groups.map((g, i) => ({
    ...g,
    generated: values[i]?.generative?.text ?? values[i]?.generated
  }))
}

/** Token accounting is reported per provider under its own key. */
function readUsage(metadata: any): GenerativeUsage | undefined {
  if (!metadata) return undefined
  const usage = Object.values(metadata).find((m: any) => m?.usage) as any
  const u = usage?.usage ?? metadata?.usage
  if (!u) return undefined
  const out: GenerativeUsage = {
    promptTokens: u.promptTokens,
    completionTokens: u.completionTokens,
    totalTokens: u.totalTokens
  }
  return Object.values(out).some((v) => v != null) ? out : undefined
}

export async function generate(
  req: GenerateRequest,
  signal?: AbortSignal
): Promise<GenerateResult> {
  const single = req.singlePrompt?.trim()
  const grouped = req.groupedTask?.trim()
  if (!single && !grouped) {
    throw new Error('Provide a single-object prompt, a grouped task, or both')
  }

  const search = req.search
  const client = await getClient(search.connectionId)
  const collection = scopeCollection(
    client,
    search.collection,
    search.tenant,
    search.consistencyLevel
  )
  const opts = buildSearchOptions(collection, search)

  // A prompt is a bare string unless we need to ask for extras alongside it,
  // in which case the client takes the object form.
  const imageProperties = (req.imageProperties ?? []).filter(Boolean)
  const wantsMetadata = Boolean(req.returnMetadata)
  const wantsDebug = Boolean(req.debug)
  const decorated = wantsMetadata || wantsDebug || imageProperties.length > 0

  const generateArg: any = {}
  if (single) {
    generateArg.singlePrompt = decorated
      ? {
          prompt: single,
          ...(wantsMetadata ? { metadata: true } : {}),
          ...(wantsDebug ? { debug: true } : {}),
          ...(imageProperties.length ? { imageProperties } : {})
        }
      : single
  }
  const groupedProperties = (req.groupedProperties ?? []).filter(Boolean)
  if (grouped) {
    // `groupedProperties` is the flat alias; the object form calls the same
    // thing `nonBlobProperties`, so only one of the two may be sent.
    generateArg.groupedTask = decorated
      ? {
          prompt: grouped,
          ...(wantsMetadata ? { metadata: true } : {}),
          ...(groupedProperties.length ? { nonBlobProperties: groupedProperties } : {}),
          ...(imageProperties.length ? { imageProperties } : {})
        }
      : grouped
    if (!decorated && groupedProperties.length) generateArg.groupedProperties = groupedProperties
  }
  const generativeConfig = buildGenerativeConfig(req)
  if (generativeConfig) generateArg.config = generativeConfig

  const started = Date.now()
  const result = await dispatchSearch(collection, search, opts, generateArg, callOptions(signal))
  const took = Date.now() - started

  return {
    objects: (result.objects ?? []).map((o: any) => ({
      ...mapObject(o),
      // v3 moved the text under `generative.text`; the flat field is the
      // deprecated alias and is still what older servers populate.
      generated: o?.generative?.text ?? o?.generated,
      debugPrompt: o?.generative?.debug?.fullPrompt,
      usage: readUsage(o?.generative?.metadata)
    })),
    generated: result?.generative?.text ?? result?.generated,
    groups: mapGeneratedGroups(result),
    usage: readUsage(result?.generative?.metadata),
    took
  }
}
