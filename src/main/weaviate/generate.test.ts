import { describe, it, expect } from 'vitest'
import { buildGenerativeConfig } from './generate'
import type { GenerateRequest } from '@shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

const base: GenerateRequest = {
  search: { connectionId: 'c', collection: 'Article', type: 'bm25' } as any,
  singlePrompt: 'summarize {content}'
}

describe('buildGenerativeConfig', () => {
  it('returns undefined when no provider is chosen, deferring to the collection', () => {
    expect(buildGenerativeConfig(base)).toBeUndefined()
  })

  it('names the module the chosen provider maps to', () => {
    const cfg = buildGenerativeConfig({ ...base, provider: 'openAI' })
    expect(cfg.name).toBe('generative-openai')
  })

  it('passes the model through', () => {
    const cfg = buildGenerativeConfig({ ...base, provider: 'openAI', model: 'gpt-4o-mini' })
    expect(cfg.config.model).toBe('gpt-4o-mini')
  })

  it('omits an empty or whitespace-only model so the provider default applies', () => {
    const cfg = buildGenerativeConfig({ ...base, provider: 'anthropic', model: '   ' })
    expect(cfg.config?.model).toBeUndefined()
  })

  it('keeps temperature 0 rather than dropping it as falsy', () => {
    const cfg = buildGenerativeConfig({ ...base, provider: 'openAI', temperature: 0 })
    expect(cfg.config.temperature).toBe(0)
  })

  it('ignores a non-finite temperature', () => {
    const cfg = buildGenerativeConfig({ ...base, provider: 'openAI', temperature: NaN })
    expect(cfg.config.temperature).toBeUndefined()
  })

  it('sends baseUrl as apiEndpoint for ollama', () => {
    const cfg = buildGenerativeConfig({
      ...base,
      provider: 'ollama',
      baseUrl: 'http://host.docker.internal:11434'
    })
    expect(cfg.name).toBe('generative-ollama')
    expect(cfg.config.apiEndpoint).toBe('http://host.docker.internal:11434')
  })

  // These providers take `baseURL` in and the SDK re-emits it as `baseUrl` on
  // the wire, so the input spelling has to be the one the factory destructures.
  it('sends baseUrl as baseURL for providers that call it that', () => {
    const cfg = buildGenerativeConfig({
      ...base,
      provider: 'anthropic',
      baseUrl: 'https://proxy.internal'
    })
    expect(cfg.config.baseUrl).toBe('https://proxy.internal')
  })

  it('leaves the endpoint unset when no baseUrl is given', () => {
    const cfg = buildGenerativeConfig({ ...base, provider: 'ollama', model: 'llama3' })
    expect(cfg.config.apiEndpoint).toBeUndefined()
  })

  it('rejects a provider the client has no factory for', () => {
    expect(() => buildGenerativeConfig({ ...base, provider: 'bogus' as any })).toThrow(
      /Unknown generative provider/
    )
  })

  it('keeps maxTokens and topP', () => {
    const cfg = buildGenerativeConfig({ ...base, provider: 'openAI', maxTokens: 256, topP: 0.9 })
    expect(cfg.config.maxTokens).toBe(256)
    expect(cfg.config.topP).toBe(0.9)
  })

  // The two spellings are not interchangeable — the factory destructures one
  // name and silently ignores the other.
  it('sends stop sequences under the name each provider destructures', () => {
    const openai = buildGenerativeConfig({ ...base, provider: 'openAI', stop: ['END'] })
    expect(openai.config.stop).toEqual({ values: ['END'] })
    const anthropic = buildGenerativeConfig({ ...base, provider: 'anthropic', stop: ['END'] })
    expect(anthropic.config.stopSequences).toEqual({ values: ['END'] })
  })

  it('sends no stop sequences to a provider that takes none', () => {
    const cfg = buildGenerativeConfig({ ...base, provider: 'ollama', stop: ['END'] })
    expect(cfg.config.stop).toBeUndefined()
    expect(cfg.config.stopSequences).toBeUndefined()
  })

  it('drops blank stop sequences', () => {
    const cfg = buildGenerativeConfig({ ...base, provider: 'openAI', stop: ['  ', ''] })
    expect(cfg.config.stop).toEqual({ values: [] })
  })

  it('rejects Azure OpenAI without its deployment triple, naming what is missing', () => {
    expect(() => buildGenerativeConfig({ ...base, provider: 'azureOpenAI' })).toThrow(
      /resourceName and deploymentId/
    )
  })

  it('accepts Azure OpenAI once resource and deployment are given', () => {
    const cfg = buildGenerativeConfig({
      ...base,
      provider: 'azureOpenAI',
      resourceName: 'my-res',
      deploymentId: 'my-dep'
    })
    expect(cfg.name).toBe('generative-azure-openai')
    expect(cfg.config.resourceName).toBe('my-res')
    expect(cfg.config.deploymentId).toBe('my-dep')
  })
})
