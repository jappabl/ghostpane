import type { BrowserWindow } from 'electron'

export function isExternalHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

export function isTrustedRendererUrl(candidateValue: string, trustedValue: string): boolean {
  try {
    const candidate = new URL(candidateValue)
    const trusted = new URL(trustedValue)
    if (trusted.protocol === 'http:' || trusted.protocol === 'https:') {
      return candidate.origin === trusted.origin
    }
    candidate.hash = ''
    trusted.hash = ''
    return candidate.toString() === trusted.toString()
  } catch {
    return false
  }
}

export function installNavigationGuards(
  win: BrowserWindow,
  trustedRendererUrl: string,
  openExternal: (url: string) => Promise<unknown>
): void {
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url, trustedRendererUrl)) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpsUrl(url)) void openExternal(url)
    return { action: 'deny' }
  })
}
