import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from '../shared/ipc'
import type { MainEvent, AskRequest, AppConfig } from '../shared/ipc'

const api = {
  onMainEvent: (cb: (e: MainEvent) => void) =>
    ipcRenderer.on(CHANNELS.mainEvent, (_e, v) => cb(v)),
  onAnswerChunk: (cb: (c: { text: string }) => void) =>
    ipcRenderer.on(CHANNELS.answerChunk, (_e, v) => cb(v)),
  onAnswerDone: (cb: () => void) =>
    ipcRenderer.on(CHANNELS.answerDone, () => cb()),
  onAnswerError: (cb: (e: { message: string }) => void) =>
    ipcRenderer.on(CHANNELS.answerError, (_e, v) => cb(v)),
  onConfig: (cb: (c: AppConfig) => void) =>
    ipcRenderer.on(CHANNELS.config, (_e, v) => cb(v)),
  onStatus: (cb: (s: string) => void) =>
    ipcRenderer.on(CHANNELS.status, (_e, v) => cb(v)),
  ask: (req: AskRequest) => ipcRenderer.send(CHANNELS.ask, req),
  setClickThrough: (val: boolean) => ipcRenderer.send(CHANNELS.setClickThrough, val),
  setModel: (model: string) => ipcRenderer.send(CHANNELS.setModel, model),
  resize: (height: number) => ipcRenderer.send(CHANNELS.resize, height)
}

contextBridge.exposeInMainWorld('ghost', api)
export type GhostApi = typeof api
