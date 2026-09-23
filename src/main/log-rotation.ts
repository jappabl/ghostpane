// The log is appended to on every ask and never truncated. Rotating at a limit
// keeps at most two files on disk instead of one that grows for the life of
// the install.
export interface RotationFs {
  size(path: string): number // bytes, or -1 when the file is absent
  rename(from: string, to: string): void
  remove(path: string): void
}

export function rotateIfOversized(path: string, limitBytes: number, fs: RotationFs): boolean {
  if (fs.size(path) <= limitBytes) return false
  const archive = `${path}.1`
  try {
    if (fs.size(archive) >= 0) fs.remove(archive)
    fs.rename(path, archive)
    return true
  } catch {
    return false // a locked or read-only log is not worth failing a write over
  }
}
