import { join } from 'path'

import { CONFIG_DIR } from '../config.ts'
import type { CueItem } from '../shared/app-state.ts'

const SESSION_PATH = join(CONFIG_DIR, 'session.json')

export interface SessionData {
  partial: boolean
  outputPath: string
  cues: CueItem[]
  log: string[]
}

export async function saveSession(data: SessionData): Promise<void> {
  const { mkdir } = await import('fs/promises')
  await mkdir(CONFIG_DIR, { recursive: true })
  await Bun.write(SESSION_PATH, JSON.stringify(data))
}

export async function loadSession(): Promise<SessionData | null> {
  const file = Bun.file(SESSION_PATH)
  if (!(await file.exists())) {
    return null
  }
  try {
    const data = (await file.json()) as SessionData
    if (
      !data.partial &&
      (!data.outputPath || !(await Bun.file(data.outputPath).exists()))
    ) {
      return null
    }
    return data
  } catch (err) {
    console.warn('Failed to read session file:', (err as Error).message)
    return null
  }
}

export async function clearSession(): Promise<void> {
  const file = Bun.file(SESSION_PATH)
  if (!(await file.exists())) {
    return
  }
  const { unlink } = await import('fs/promises')
  await unlink(SESSION_PATH)
}
