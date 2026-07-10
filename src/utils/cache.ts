import { mkdir } from 'fs/promises'
import { join } from 'path'

import { logger } from './logger.ts'

interface CacheEntry {
  youtubeId: string
  filePath: string
  cachedAt: number
}

interface CacheIndex {
  version: 1
  entries: CacheEntry[]
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000

export class TrailerCache {
  private indexPath: string
  private index: CacheIndex = { version: 1, entries: [] }

  constructor(private cacheDir: string) {
    this.indexPath = join(cacheDir, 'index.json')
  }

  async init(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true })
    const file = Bun.file(this.indexPath)
    if (await file.exists()) {
      this.index = await file.json()
    }
    const purged = await this.purgeExpired()
    if (purged > 0) logger.debug(`Purged ${purged} expired trailer(s) from cache`)
  }

  async get(youtubeId: string): Promise<string | null> {
    const entry = this.index.entries.find(e => e.youtubeId === youtubeId)
    if (!entry) return null
    if (Date.now() - entry.cachedAt > TTL_MS) {
      await this.invalidate(youtubeId)
      return null
    }
    if (!(await Bun.file(entry.filePath).exists())) {
      await this.invalidate(youtubeId)
      return null
    }
    return entry.filePath
  }

  async set(youtubeId: string, filePath: string): Promise<void> {
    this.index.entries = this.index.entries.filter(e => e.youtubeId !== youtubeId)
    this.index.entries.push({ youtubeId, filePath, cachedAt: Date.now() })
    await this.save()
  }

  async invalidate(youtubeId: string): Promise<void> {
    this.index.entries = this.index.entries.filter(e => e.youtubeId !== youtubeId)
    await this.save()
  }

  async purgeExpired(): Promise<number> {
    const before = this.index.entries.length
    const valid: CacheEntry[] = []
    for (const entry of this.index.entries) {
      if (Date.now() - entry.cachedAt > TTL_MS) continue
      if (!(await Bun.file(entry.filePath).exists())) continue
      valid.push(entry)
    }
    this.index.entries = valid
    if (valid.length !== before) await this.save()
    return before - valid.length
  }

  private async save(): Promise<void> {
    await Bun.write(this.indexPath, JSON.stringify(this.index, null, 2))
  }
}
