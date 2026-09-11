import { rm } from 'fs/promises'

let activeTmpDir: string | null = null

export function setActiveTmpDir(dir: string | null): void {
  activeTmpDir = dir
}

export async function cleanupTmpDir(): Promise<void> {
  if (!activeTmpDir) {
    return
  }
  const dir = activeTmpDir
  activeTmpDir = null
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
}
