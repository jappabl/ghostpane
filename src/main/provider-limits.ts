// Bounds on what a provider subprocess can make the main process hold or wait
// for. Without them a chatty or wedged CLI grows the heap for the life of the
// app and can leave an ask permanently in flight.

// Only the tail of stderr is ever read (for the failure reason), so keep that.
export const MAX_STDERR_BYTES = 8_192

// A streamed JSONL line far larger than any real provider event — treat the
// buffer as garbage rather than letting it grow without a newline in sight.
export const MAX_LINE_BYTES = 1_048_576

// A provider that has produced nothing for this long is not coming back.
// Long enough for slow reasoning on a dense screenshot; short enough that the
// overlay frees its screenshot and accepts a new question the same session.
export const PROVIDER_TIMEOUT_MS = 180_000
