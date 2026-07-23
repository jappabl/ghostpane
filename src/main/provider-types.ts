import type { spawn } from 'child_process'
import type { ProviderId } from '../shared/providers'

export type LogLevel = 'info' | 'warn' | 'error'

export interface ProviderAvailability {
  bin: string
  pathEnv: string
  found: boolean
  setupCommand: string
}

export interface ProviderAskOptions {
  prompt: string
  imagePath?: string
  model?: string
  onChunk: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
  onLog?: (level: LogLevel, message: string, extra?: unknown) => void
  spawnFn?: typeof spawn
  pathEnv?: string
}

export interface AiProvider {
  id: ProviderId
  resolve(): ProviderAvailability
  ask(options: ProviderAskOptions): void
}
