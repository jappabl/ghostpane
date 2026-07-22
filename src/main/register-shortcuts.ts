import { DEFAULT_SHORTCUTS } from '../shared/shortcuts'
import type { MainEvent } from '../shared/ipc'

export interface ShortcutDeps {
  register: (accelerator: string, cb: () => void) => boolean
}

export function registerShortcuts(
  onEvent: (e: MainEvent) => void,
  deps: ShortcutDeps,
  map: Record<MainEvent, string> = DEFAULT_SHORTCUTS,
  omit: ReadonlySet<MainEvent> = new Set()
): Array<{ event: MainEvent; accelerator: string; ok: boolean }> {
  return (Object.entries(map) as [MainEvent, string][])
    .filter(([event]) => !omit.has(event))
    .map(([event, accelerator]) => {
      const ok = deps.register(accelerator, () => onEvent(event))
      return { event, accelerator, ok }
    })
}
