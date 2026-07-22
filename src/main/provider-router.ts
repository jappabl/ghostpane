import type { ProviderId } from '../shared/providers'
import type { ProviderAskOptions } from './provider-types'

export type ProviderHandlers = Record<ProviderId, (options: ProviderAskOptions) => void>

export function routeAsk(
  provider: ProviderId,
  handlers: ProviderHandlers,
  options: ProviderAskOptions
): void {
  handlers[provider](options)
}
