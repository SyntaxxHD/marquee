import { rm } from 'fs/promises'

import { logger } from './logger.ts'

let activeTmpDir: string | null = null

export function setActiveTmpDir(dir: string | null): void {
  activeTmpDir = dir
}

export async function cleanupTmpDir(): Promise<void> {
  if (!activeTmpDir) return
  const dir = activeTmpDir
  activeTmpDir = null
  try {
    await rm(dir, { recursive: true, force: true })
  } catch (err) {
    logger.debug(`Cleanup failed for ${dir}: ${(err as Error).message}`)
  }
}
