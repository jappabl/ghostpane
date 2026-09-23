// Screenshots are deleted when their ask finishes. A crash or a force-quit
// skips that, leaving PNGs the size of a display in the temp directory
// forever. Names look like: ghostpane-<epochMillis>-<counter>.png
const CAPTURE_NAME = /^ghostpane-(\d+)-\d+\.png$/

export function staleCaptureFiles(names: string[], now: number, maxAgeMs: number): string[] {
  return names.filter((name) => {
    const match = CAPTURE_NAME.exec(name)
    if (!match) return false
    return now - Number(match[1]) > maxAgeMs
  })
}
