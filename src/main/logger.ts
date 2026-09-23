import { app } from 'electron'
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { rotateIfOversized, type RotationFs } from './log-rotation'

const LOG_LIMIT_BYTES = 2 * 1024 * 1024
const ROTATE_CHECK_BYTES = 64 * 1024

let logPath = ''
let sinceRotateCheck = 0

const nodeFs: RotationFs = {
  size: (path) => { try { return statSync(path).size } catch { return -1 } },
  rename: renameSync,
  remove: (path) => rmSync(path, { force: true })
}

export function initLogger(): string {
  const dir = app.getPath('logs') // macOS: ~/Library/Logs/Ghostpane
  try { mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  logPath = join(dir, 'ghostpane.log')
  rotateIfOversized(logPath, LOG_LIMIT_BYTES, nodeFs)
  log('info', '=== ghostpane started ===', { version: app.getVersion(), platform: process.platform })
  return logPath
}

export function getLogPath(): string { return logPath }
export function getLogDir(): string { return logPath ? dirname(logPath) : '' }

export function log(level: 'info' | 'warn' | 'error', msg: string, extra?: unknown): void {
  const line = `${new Date().toISOString()} [${level}] ${msg}` +
    (extra !== undefined ? '  ' + safe(extra) : '') + '\n'
  try {
    if (logPath) {
      appendFileSync(logPath, line)
      // Cheap amortised check: stat only once per ROTATE_CHECK_BYTES written.
      sinceRotateCheck += line.length
      if (sinceRotateCheck >= ROTATE_CHECK_BYTES) {
        sinceRotateCheck = 0
        rotateIfOversized(logPath, LOG_LIMIT_BYTES, nodeFs)
      }
    }
  } catch { /* ignore */ }
  process.stderr.write(line)
}

function safe(v: unknown): string {
  if (v instanceof Error) return v.stack || v.message
  try { return typeof v === 'string' ? v : JSON.stringify(v) } catch { return String(v) }
}
