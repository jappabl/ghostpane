import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { log } from './logger'
import { isModelForProvider, isProviderId, type ProviderId } from '../shared/providers'

export interface Settings {
  provider: ProviderId
  models: Record<ProviderId, string>
}

const DEFAULTS: Settings = { provider: 'openai', models: { openai: '', claude: '' } }
let cache: Settings | null = null

function file(): string { return join(app.getPath('userData'), 'settings.json') }

export function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULTS)
  const value = raw as Record<string, unknown>
  const provider = isProviderId(value.provider) ? value.provider : DEFAULTS.provider
  const storedModels = value.models && typeof value.models === 'object'
    ? value.models as Record<string, unknown>
    : {}
  const legacyClaude = isModelForProvider('claude', value.model) ? value.model : ''
  return {
    provider,
    models: {
      openai: isModelForProvider('openai', storedModels.openai) ? storedModels.openai : '',
      claude: isModelForProvider('claude', storedModels.claude)
        ? storedModels.claude
        : legacyClaude
    }
  }
}

export function getSettings(): Settings {
  if (cache) return cache
  try { cache = normalizeSettings(JSON.parse(readFileSync(file(), 'utf8'))) }
  catch { cache = structuredClone(DEFAULTS) }
  return cache
}

function save(settings: Settings): Settings {
  cache = settings
  try { writeFileSync(file(), JSON.stringify(cache)) } catch (e) { log('error', 'failed to save settings', e) }
  return cache
}

export function setProvider(provider: ProviderId): Settings {
  log('info', 'provider set', { provider })
  return save({ ...getSettings(), provider })
}

export function setModel(model: string, provider = getSettings().provider): Settings {
  log('info', 'model set', { provider, model: model || '(default)' })
  return save({
    ...getSettings(),
    models: { ...getSettings().models, [provider]: model }
  })
}
