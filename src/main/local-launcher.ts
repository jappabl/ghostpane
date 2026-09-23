import { spawn as realSpawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface LaunchedProcess {
  kill(): void
  exitCode?: number | null
}

export interface LaunchDeps {
  home: string
  exists(path: string): boolean
  spawn(command: string, args: string[]): LaunchedProcess
}

interface Candidate {
  runtime: string
  path: string
  command: string
  args: string[]
  // True when Ghostpane owns the process and should stop it on quit. A GUI
  // app or LM Studio's daemon belongs to the user and keeps running.
  owned: boolean
}

function candidates(home: string): Candidate[] {
  const ollamaBins = ['/opt/homebrew/bin/ollama', '/usr/local/bin/ollama', join(home, '.local', 'bin', 'ollama')]
  const lms = join(home, '.lmstudio', 'bin', 'lms')
  return [
    { runtime: 'Ollama', path: '/Applications/Ollama.app', command: 'open', args: ['-a', '/Applications/Ollama.app'], owned: false },
    ...ollamaBins.map((bin) => ({ runtime: 'Ollama', path: bin, command: bin, args: ['serve'], owned: true })),
    { runtime: 'LM Studio', path: lms, command: lms, args: ['server', 'start'], owned: false }
  ]
}

// Starts a local model runtime the user has installed but is not running, so
// picking "Local" works without first opening Terminal or another app.
export class LocalLauncher {
  private owned: { runtime: string; process: LaunchedProcess } | null = null

  constructor(private readonly deps: LaunchDeps = defaultDeps()) {}

  start(): string | null {
    if (this.owned && typeof this.owned.process.exitCode !== 'number') return this.owned.runtime
    this.owned = null
    for (const candidate of candidates(this.deps.home)) {
      if (!this.deps.exists(candidate.path)) continue
      try {
        const process = this.deps.spawn(candidate.command, candidate.args)
        if (candidate.owned) this.owned = { runtime: candidate.runtime, process }
        return candidate.runtime
      } catch {
        continue // try the next installed runtime
      }
    }
    return null
  }

  stop(): void {
    this.owned?.process.kill()
    this.owned = null
  }
}

function defaultDeps(): LaunchDeps {
  return {
    home: homedir(),
    exists: existsSync,
    spawn: (command, args) => {
      const child = realSpawn(command, args, { stdio: 'ignore' })
      child.on('error', () => { /* reported by the caller when the server never answers */ })
      return child
    }
  }
}
