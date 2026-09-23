import { describe, expect, it } from 'vitest'
import { isModelForProvider, isProviderId } from '../src/shared/providers'
import { normalizeSettings } from '../src/main/settings'

describe('provider catalog', () => {
  it('accepts only known providers and their models', () => {
    expect(isProviderId('openai')).toBe(true)
    expect(isProviderId('claude')).toBe(true)
    expect(isProviderId('other')).toBe(false)
    expect(isModelForProvider('openai', 'gpt-5.6-sol')).toBe(true)
    expect(isModelForProvider('openai', 'sonnet')).toBe(false)
    expect(isModelForProvider('claude', 'sonnet')).toBe(true)
  })
})

describe('normalizeSettings', () => {
  it('migrates a legacy Claude model while defaulting to ChatGPT', () => {
    expect(normalizeSettings({ model: 'sonnet' })).toEqual({
      provider: 'openai',
      models: { openai: '', claude: 'sonnet', local: '' }
    })
  })

  it('rejects unknown persisted provider and model values', () => {
    expect(normalizeSettings({
      provider: 'other',
      models: { openai: '--bad', claude: 'bogus' }
    })).toEqual({
      provider: 'openai',
      models: { openai: '', claude: '', local: '' }
    })
  })

  it('preserves valid provider-specific choices', () => {
    expect(normalizeSettings({
      provider: 'claude',
      models: { openai: 'gpt-5.6-terra', claude: 'opus' }
    })).toEqual({
      provider: 'claude',
      models: { openai: 'gpt-5.6-terra', claude: 'opus', local: '' }
    })
  })
})

describe('local provider', () => {
  it('is a known provider', () => {
    expect(isProviderId('local')).toBe(true)
  })

  it('accepts whatever model ids the local server reports', () => {
    for (const id of ['', 'llama3.2:latest', 'hf.co/bartowski/Qwen2.5-7B-GGUF:Q4_K_M', 'lmstudio-community/gemma-3-4b-it']) {
      expect(isModelForProvider('local', id), id).toBe(true)
    }
  })

  it('rejects ids that are not model names', () => {
    for (const id of ['--flag', 'has space', 'a'.repeat(300), 42]) {
      expect(isModelForProvider('local', id), String(id)).toBe(false)
    }
  })

  it('persists a local model choice alongside the others', () => {
    expect(normalizeSettings({ provider: 'local', models: { local: 'mistral:7b' } })).toEqual({
      provider: 'local',
      models: { openai: '', claude: '', local: 'mistral:7b' }
    })
  })
})
