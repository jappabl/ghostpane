export type ProviderId = 'openai' | 'claude' | 'local'

export interface ModelOption { id: string; label: string }
export interface ProviderOption { id: ProviderId; label: string; models: readonly ModelOption[] }

export const PROVIDERS: readonly ProviderOption[] = [
  {
    id: 'openai',
    label: 'ChatGPT',
    models: [
      { id: '', label: 'Default' },
      { id: 'gpt-5.6-sol', label: 'Sol' },
      { id: 'gpt-5.6-terra', label: 'Terra' },
      { id: 'gpt-5.6-luna', label: 'Luna' }
    ]
  },
  {
    id: 'claude',
    label: 'Claude',
    models: [
      { id: '', label: 'Default' },
      { id: 'opus', label: 'Opus' },
      { id: 'sonnet', label: 'Sonnet' },
      { id: 'haiku', label: 'Haiku' }
    ]
  },
  {
    id: 'local',
    label: 'Local',
    // The real list comes from whichever local server is running (see AppConfig.models).
    models: [{ id: '', label: 'Auto' }]
  }
] as const

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'openai' || value === 'claude' || value === 'local'
}

// Local model ids are whatever the user's server reports, so check their shape
// instead of membership in a fixed list.
const LOCAL_MODEL_ID = /^[A-Za-z0-9_][\w.:\-/@+]{0,199}$/

export function modelsForProvider(provider: ProviderId): readonly ModelOption[] {
  return PROVIDERS.find((entry) => entry.id === provider)!.models
}

export function isModelForProvider(provider: ProviderId, value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (provider === 'local') return value === '' || LOCAL_MODEL_ID.test(value)
  return modelsForProvider(provider).some((model) => model.id === value)
}
