export const CHANNELS = {
  mainEvent: 'main:event',        // main → renderer: MainEvent
  ask: 'renderer:ask',            // renderer → main: AskRequest
  answerChunk: 'main:answer-chunk',
  answerDone: 'main:answer-done',
  answerError: 'main:answer-error',
  setClickThrough: 'renderer:set-click-through', // renderer → main: boolean
  resize: 'renderer:resize'        // renderer → main: desired content height (px)
} as const

export type MainEvent =
  | 'toggle' | 'ask-screenshot' | 'focus-input'
  | 'scroll-up' | 'scroll-down' | 'toggle-click-through' | 'quit'

export interface AskRequest { prompt: string; withScreenshot: boolean }
export interface AnswerChunk { text: string }
export interface AnswerError { message: string }
