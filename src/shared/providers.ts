export type ProviderId = 'openai' | 'claude'

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
  }
] as const

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'openai' || value === 'claude'
}

export function modelsForProvider(provider: ProviderId): readonly ModelOption[] {
  return PROVIDERS.find((entry) => entry.id === provider)!.models
}

export function isModelForProvider(provider: ProviderId, value: unknown): value is string {
  return typeof value === 'string' && modelsForProvider(provider).some((model) => model.id === value)
}
