import { readdir } from 'fs/promises'
import { join } from 'path'

import { MarqueeError } from '../utils/errors.ts'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi'])

export interface AdResult {
  filePath: string
  fileName: string
}

export async function pickAds(adsDir: string, count: number): Promise<AdResult[]> {
  let entries: string[]
  try {
    entries = await readdir(adsDir)
  } catch {
    throw new MarqueeError(`Ads directory not found: ${adsDir}`)
  }

  const videos = entries.filter(f => {
    const ext = f.toLowerCase().slice(f.lastIndexOf('.'))
    return VIDEO_EXTENSIONS.has(ext)
  })

  if (videos.length === 0) {
    throw new MarqueeError(`No video files found in ads directory: ${adsDir}`)
  }

  const shuffled = [...videos].sort(() => Math.random() - 0.5)
  const picked: AdResult[] = []
  for (let i = 0; i < count; i++) {
    const fileName = shuffled[i % shuffled.length]
    picked.push({ filePath: join(adsDir, fileName), fileName })
  }
  return picked
}
