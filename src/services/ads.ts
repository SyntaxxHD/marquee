import { readdir } from 'fs/promises'
import { join } from 'path'

import type { SelectionMode } from '../config.ts'
import { MarqueeError } from '../utils/errors.ts'

import { probeFileDuration } from './player.ts'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi'])

export interface AdResult {
  filePath: string
  fileName: string
  title: string
}

export interface VideoSelectionOptions {
  selectionMode: SelectionMode
  count: number
  targetMs: number
  maxLengthMs: number | null
}

export async function pickLocalVideos(
  dir: string,
  options: VideoSelectionOptions,
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

  const probed = await Promise.all(
    videos.map(async f => {
      const filePath = join(dir, f)
      const duration = await probeFileDuration(filePath)
      return { filePath, fileName: f, duration }
    })
  )

  const filtered =
    options.maxLengthMs !== null
      ? probed.filter(v => v.duration !== null && v.duration <= options.maxLengthMs!)
      : probed.filter(v => v.duration !== null)

  if (filtered.length === 0) {
    throw new MarqueeError(
      `No ${kind} in ${dir} pass the max-length filter. Increase the limit or add shorter files.`
    )
  }

  const shuffled = [...filtered].sort(() => Math.random() - 0.5)

  const toResult = (v: (typeof shuffled)[0]): AdResult => {
    const title = v.fileName.slice(
      0,
      v.fileName.lastIndexOf('.') > 0 ? v.fileName.lastIndexOf('.') : undefined
    )
    return { filePath: v.filePath, fileName: v.fileName, title }
  }

  if (options.selectionMode === 'duration') {
    const picked: AdResult[] = []
    let totalMs = 0
    for (const v of shuffled) {
      if (totalMs >= options.targetMs) {
        break
      }
      picked.push(toResult(v))
      totalMs += v.duration ?? 0
    }
    return picked
  }

  const picked: AdResult[] = []
  for (let i = 0; i < options.count; i++) {
    const v = shuffled[i % shuffled.length]
    picked.push(toResult(v))
  }
  return picked
}

export function pickAds(
  adsDir: string,
  options: VideoSelectionOptions
): Promise<AdResult[]> {
  return pickLocalVideos(adsDir, options, 'ad videos')
}
