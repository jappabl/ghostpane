import type { BrowserWindowConstructorOptions } from 'electron'

export const OVERLAY_SURFACE_OPTIONS = {
  transparent: true,
  backgroundColor: '#00000000',
  hasShadow: false
} satisfies Pick<
  BrowserWindowConstructorOptions,
  'transparent' | 'backgroundColor' | 'hasShadow'
>
