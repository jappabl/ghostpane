import type { GhostApi } from '../preload/index'
declare global { interface Window { ghost: GhostApi } }
export {}
