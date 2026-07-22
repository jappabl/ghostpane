import { unlink } from 'fs/promises'

export class OwnedPaths {
  private readonly paths = new Set<string>()

  constructor(private readonly unlinkPath: (path: string) => Promise<unknown> = unlink) {}

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
    await Promise.allSettled(pending.map((path) => this.unlinkPath(path)))
  }
}
