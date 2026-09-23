import { describe, expect, it, vi } from 'vitest'
import { LocalLauncher, type LaunchDeps } from '../src/main/local-launcher'

function deps(installed: string[]) {
  const kills: string[] = []
  const spawned: Array<[string, string[]]> = []
  const d: LaunchDeps = {
    home: '/Users/me',
    exists: (path) => installed.includes(path),
    spawn: (command, args) => {
      spawned.push([command, args])
      return { kill: () => { kills.push(command) } }
    }
  }
  return { d, spawned, kills }
}

describe('LocalLauncher', () => {
  it('opens the Ollama app when it is installed', () => {
    const { d, spawned } = deps(['/Applications/Ollama.app'])
    expect(new LocalLauncher(d).start()).toBe('Ollama')
    expect(spawned).toEqual([['open', ['-a', '/Applications/Ollama.app']]])
  })

  it('runs `ollama serve` for a command-line install', () => {
    const { d, spawned } = deps(['/opt/homebrew/bin/ollama'])
    expect(new LocalLauncher(d).start()).toBe('Ollama')
    expect(spawned).toEqual([['/opt/homebrew/bin/ollama', ['serve']]])
  })

  it('starts the LM Studio server when that is what is installed', () => {
    const { d, spawned } = deps(['/Users/me/.lmstudio/bin/lms'])
    expect(new LocalLauncher(d).start()).toBe('LM Studio')
    expect(spawned).toEqual([['/Users/me/.lmstudio/bin/lms', ['server', 'start']]])
  })

  it('prefers Ollama when both runtimes are installed', () => {
    const { d } = deps(['/Users/me/.lmstudio/bin/lms', '/usr/local/bin/ollama'])
    expect(new LocalLauncher(d).start()).toBe('Ollama')
  })

  it('reports that nothing is installed', () => {
    const { d, spawned } = deps([])
    expect(new LocalLauncher(d).start()).toBeNull()
    expect(spawned).toEqual([])
  })

  it('does not launch a second server while its own is still running', () => {
    const { d, spawned } = deps(['/opt/homebrew/bin/ollama'])
    const launcher = new LocalLauncher(d)
    launcher.start()
    launcher.start()
    expect(spawned).toHaveLength(1)
  })

  it('stops the server it started itself when the app quits', () => {
    const { d, kills } = deps(['/opt/homebrew/bin/ollama'])
    const launcher = new LocalLauncher(d)
    launcher.start()
    launcher.stop()
    expect(kills).toEqual(['/opt/homebrew/bin/ollama'])
  })

  it('leaves an app the user owns running when Ghostpane quits', () => {
    const { d, kills } = deps(['/Applications/Ollama.app'])
    const launcher = new LocalLauncher(d)
    launcher.start()
    launcher.stop()
    expect(kills).toEqual([])
  })

  it('treats a launch that throws as nothing started', () => {
    const d: LaunchDeps = {
      home: '/Users/me',
      exists: () => true,
      spawn: vi.fn(() => { throw new Error('EACCES') })
    }
    expect(new LocalLauncher(d).start()).toBeNull()
  })
})
