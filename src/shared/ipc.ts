import { modelsForProvider, type ProviderId } from './providers'

export const CHANNELS = {
  mainEvent: 'main:event',        // main → renderer: MainEvent
  ask: 'renderer:ask',            // renderer → main: AskRequest
  answerChunk: 'main:answer-chunk',
  answerDone: 'main:answer-done',
  answerError: 'main:answer-error',
  setClickThrough: 'renderer:set-click-through', // renderer → main: boolean
  resize: 'renderer:resize',      // renderer → main: desired content height (px)
  config: 'main:config',          // main → renderer: AppConfig
  setModel: 'renderer:set-model', // renderer → main: model id string
  setProvider: 'renderer:set-provider', // renderer → main: ProviderId
  status: 'main:status'           // main → renderer: status text ('' = clear)
} as const

export type MainEvent =
  | 'toggle' | 'ask-screenshot' | 'focus-input'
  | 'scroll-up' | 'scroll-down' | 'toggle-click-through' | 'open-logs' | 'quit'

export interface AskRequest { prompt: string; withScreenshot: boolean }
export interface AnswerChunk { text: string }
export interface AnswerError { message: string }

// Kept until the renderer migrates to the provider catalog.
export { type ModelOption } from './providers'
export { modelsForProvider }
export const MODELS = modelsForProvider('claude')

export interface AppConfig {
  provider: ProviderId
  model: string
  logPath: string
}
