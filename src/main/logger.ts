import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'

let logPath = ''

export function initLogger(): string {
  const dir = app.getPath('logs') // macOS: ~/Library/Logs/Ghostpane
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  logPath = join(dir, 'ghostpane.log')
  log('info', '=== ghostpane started ===', { version: app.getVersion(), platform: process.platform })
  return logPath
}

export function getLogPath(): string { return logPath }
export function getLogDir(): string { return logPath ? dirname(logPath) : '' }

export function log(level: 'info' | 'warn' | 'error', msg: string, extra?: unknown): void {
  const line = `${new Date().toISOString()} [${level}] ${msg}` +
    (extra !== undefined ? '  ' + safe(extra) : '') + '\n'
  try { if (logPath) appendFileSync(logPath, line) } catch { /* ignore */ }
  process.stderr.write(line)
}

function safe(v: unknown): string {
  if (v instanceof Error) return v.stack || v.message
  try { return typeof v === 'string' ? v : JSON.stringify(v) } catch { return String(v) }
}
