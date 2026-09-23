export interface Rect { x: number; y: number; width: number; height: number }

export interface Size { width: number; height: number }

// desktopCapturer allocates a bitmap this size for EVERY connected display on
// every capture. At native Retina resolution that is ~24MB per laptop display
// and ~59MB per 5K, which sets the app's memory ceiling. Capping the long edge
// keeps text legible (still well above logical resolution) at a fraction of it.
export function captureThumbnailSize(
  displayBounds: Rect, scaleFactor: number, maxLongEdge: number
): Size {
  const width = Math.round(displayBounds.width * scaleFactor)
  const height = Math.round(displayBounds.height * scaleFactor)
  const scale = Math.min(1, maxLongEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}
