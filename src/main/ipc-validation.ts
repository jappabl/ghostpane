import { isModelForProvider, isProviderId, type ProviderId } from '../shared/providers'
import type { AskRequest } from '../shared/ipc'
import { isTrustedRendererUrl } from './navigation'

interface FrameLike { url: string }
interface WebContentsLike { mainFrame: FrameLike; getURL(): string }
interface WindowLike { webContents: WebContentsLike }
interface IpcEventLike { sender: unknown; senderFrame: FrameLike | null }

export function isTrustedSender(event: IpcEventLike, win: WindowLike): boolean {
  return event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    isTrustedRendererUrl(event.senderFrame?.url ?? '', win.webContents.getURL())
}

export function parseAskRequest(value: unknown): AskRequest | null {
  if (!value || typeof value !== 'object') return null
  const request = value as Record<string, unknown>
  if (typeof request.prompt !== 'string' || request.prompt.length > 20_000) return null
  if (typeof request.withScreenshot !== 'boolean') return null
  return { prompt: request.prompt, withScreenshot: request.withScreenshot }
}

export function parseBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function parseResize(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function parseProvider(value: unknown): ProviderId | null {
  return isProviderId(value) ? value : null
}

export function parseModel(provider: ProviderId, value: unknown): string | null {
  return isModelForProvider(provider, value) ? value : null
}
