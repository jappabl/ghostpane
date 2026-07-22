export interface Rect { x: number; y: number; width: number; height: number }

export function displayPixelRect(
  displayBounds: Rect, scaleFactor: number, imageWidth: number, imageHeight: number
): Rect {
  const width = Math.min(Math.round(displayBounds.width * scaleFactor), imageWidth)
  const height = Math.min(Math.round(displayBounds.height * scaleFactor), imageHeight)
  return { x: 0, y: 0, width, height }
}
