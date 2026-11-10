import { modelsForProvider, type ModelOption, type ProviderId } from './providers'

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
  openExternal: 'renderer:open-external', // renderer → main: validated HTTPS URL
  status: 'main:status',          // main → renderer: status text ('' = clear)
  recording: 'main:recording',    // main → renderer: RecordingState
  answerMode: 'main:answer-mode'  // main → renderer: AnswerMode for the ask just started
} as const

export type MainEvent =
  | 'toggle' | 'ask-screenshot' | 'ask-explain'
  | 'scroll-up' | 'scroll-down' | 'toggle-click-through' | 'open-logs' | 'quit'

// 'letter': a multiple-choice answer shows only its letter.
// 'explain': the whole worked answer is shown.
export type AnswerMode = 'letter' | 'explain'

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
  // Choices for the model menu. Fixed for cloud providers; for Local, whatever
  // the running server has installed.
  models: readonly ModelOption[]
  logPath: string
}

export interface RecordingState { active: boolean; elapsedMs: number }
