import { unlink } from 'fs/promises'

export class OwnedPaths {
  private readonly paths = new Set<string>()

  constructor(
    private readonly unlinkPath: (path: string) => Promise<unknown> = unlink,
    private readonly onCleanupError: (path: string, error: unknown) => void = () => {}
  ) {}

  add(path: string): string {
    this.paths.add(path)
    return path
  }

  release(path: string): void {
    this.paths.delete(path)
  }

  async cleanup(): Promise<void> {
    const pending = [...this.paths]
    this.paths.clear()
    await Promise.all(pending.map(async (path) => {
      try { await this.unlinkPath(path) }
      catch (error) { this.onCleanupError(path, error) }
    }))
  }
}
