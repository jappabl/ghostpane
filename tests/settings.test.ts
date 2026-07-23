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
      models: { openai: '', claude: 'sonnet' }
    })
  })

  it('rejects unknown persisted provider and model values', () => {
    expect(normalizeSettings({
      provider: 'other',
      models: { openai: '--bad', claude: 'bogus' }
    })).toEqual({
      provider: 'openai',
      models: { openai: '', claude: '' }
    })
  })

  it('preserves valid provider-specific choices', () => {
    expect(normalizeSettings({
      provider: 'claude',
      models: { openai: 'gpt-5.6-terra', claude: 'opus' }
    })).toEqual({
      provider: 'claude',
      models: { openai: 'gpt-5.6-terra', claude: 'opus' }
    })
  })
})
