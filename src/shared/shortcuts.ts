import type { MainEvent } from './ipc'

export const DEFAULT_SHORTCUTS: Record<MainEvent, string> = {
  'toggle': 'CommandOrControl+\\',
  'ask-screenshot': 'CommandOrControl+Return',
  'focus-input': 'CommandOrControl+Shift+Space',
  'scroll-up': 'CommandOrControl+Up',
  'scroll-down': 'CommandOrControl+Down',
  'toggle-click-through': 'CommandOrControl+Shift+\\',
  'open-logs': 'CommandOrControl+Shift+L',
  'quit': 'CommandOrControl+Shift+Q'
}
