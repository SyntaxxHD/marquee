import { readdir } from 'fs/promises'
import { join } from 'path'

import { MarqueeError } from '../utils/errors.ts'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi'])

export interface AdResult {
  filePath: string
  fileName: string
}

export async function pickLocalVideos(
  dir: string,
  count: number,
  kind = 'videos'
): Promise<AdResult[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    throw new MarqueeError(`Directory not found: ${dir}`)
  }

  const videos = entries.filter(f => {
    const ext = f.toLowerCase().slice(f.lastIndexOf('.'))
    return VIDEO_EXTENSIONS.has(ext)
  })

  if (videos.length === 0) {
    throw new MarqueeError(`No ${kind} found in directory: ${dir}`)
  }

  const shuffled = [...videos].sort(() => Math.random() - 0.5)
  const picked: AdResult[] = []
  for (let i = 0; i < count; i++) {
    const fileName = shuffled[i % shuffled.length]
    picked.push({ filePath: join(dir, fileName), fileName })
  }
  return picked
}

export function pickAds(adsDir: string, count: number): Promise<AdResult[]> {
  return pickLocalVideos(adsDir, count, 'ad videos')
}
