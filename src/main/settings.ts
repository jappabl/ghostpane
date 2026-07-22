import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { log } from './logger'

export interface Settings { model: string } // '' = subscription default

const DEFAULTS: Settings = { model: '' }
let cache: Settings | null = null

function file(): string { return join(app.getPath('userData'), 'settings.json') }

export function getSettings(): Settings {
  if (cache) return cache
  let s: Settings
  try {
    s = { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    s = { ...DEFAULTS }
  }
  cache = s
  return s
}

export function setModel(model: string): Settings {
  cache = { ...getSettings(), model }
  try { writeFileSync(file(), JSON.stringify(cache)) } catch (e) { log('error', 'failed to save settings', e) }
  log('info', 'model set', { model: model || '(default)' })
  return cache
}
