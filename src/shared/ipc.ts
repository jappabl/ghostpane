export const CHANNELS = {
  mainEvent: 'main:event',        // main → renderer: MainEvent
  ask: 'renderer:ask',            // renderer → main: AskRequest
  answerChunk: 'main:answer-chunk',
  answerDone: 'main:answer-done',
  answerError: 'main:answer-error',
  setClickThrough: 'renderer:set-click-through', // renderer → main: boolean
  resize: 'renderer:resize',      // renderer → main: desired content height (px)
  config: 'main:config',          // main → renderer: AppConfig
  setModel: 'renderer:set-model'  // renderer → main: model id string
} as const

export type MainEvent =
  | 'toggle' | 'ask-screenshot' | 'focus-input'
  | 'scroll-up' | 'scroll-down' | 'toggle-click-through' | 'open-logs' | 'quit'

export interface AskRequest { prompt: string; withScreenshot: boolean }
export interface AnswerChunk { text: string }
export interface AnswerError { message: string }

export interface ModelOption { id: string; label: string }
// id is passed to `claude --model`; '' means the subscription default.
export const MODELS: ModelOption[] = [
  { id: '', label: 'Default' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' }
]

export interface AppConfig { model: string; logPath: string }
