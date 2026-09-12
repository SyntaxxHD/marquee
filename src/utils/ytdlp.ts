import _YTDlpWrap from 'yt-dlp-wrap'

import { resolveBinaries } from './bins.ts'
import { exec } from './exec.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const YTDlpWrap: typeof _YTDlpWrap = (_YTDlpWrap as any).default ?? _YTDlpWrap

const YTDLP_FORMAT =
  'bestvideo[ext=mp4][height<=2160]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best[ext=mp4]/best'

function summarizeError(raw: string): string {
  const stderrSection = raw.split('\n\nStderr:\n')[1] ?? raw
  const lines = stderrSection.split('\n').map((l: string) => l.trim())
  const errorLine = lines.find((l: string) => l.startsWith('ERROR:'))
  if (errorLine) {
    return errorLine.replace(/^ERROR:\s*/, '').replace(/^\[[^\]]+\]\s*/, '')
  }
  return lines.find(l => l.length > 0) ?? 'download failed'
}

export async function getVideoInfo(
  youtubeId: string
): Promise<{ durationMs: number } | null> {
  const bins = await resolveBinaries()
  const result = await exec(
    [
      bins.ytDlp,
      '--dump-json',
      '--no-warnings',
      '--no-download',
      `https://www.youtube.com/watch?v=${youtubeId}`
    ],
    { captureOutput: true, silent: true }
  )
  if (result.exitCode !== 0) {
    return null
  }
  try {
    const json = JSON.parse(result.stdout) as { duration?: number }
    const seconds = json.duration
    if (typeof seconds !== 'number' || isNaN(seconds)) {
      return null
    }
    return { durationMs: seconds * 1000 }
  } catch {
    return null
  }
}

export async function downloadVideo(
  youtubeId: string,
  outputPath: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const bins = await resolveBinaries()
  const ytdlp = new YTDlpWrap(bins.ytDlp)

  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Cancelled'))
      return
    }

    ytdlp
      .exec(
        [
          `https://www.youtube.com/watch?v=${youtubeId}`,
          '-f',
          YTDLP_FORMAT,
          '--merge-output-format',
          'mp4',
          '--ffmpeg-location',
          bins.ffmpeg,
          '--no-playlist',
          '--no-warnings',
          '-o',
          outputPath
        ],
        undefined,
        signal ?? null
      )
      .on('progress', ({ percent }) => onProgress?.(percent ?? 0))
      .on('error', err => reject(new Error(summarizeError(err.message))))
      .on('close', code => {
        if (signal?.aborted) {
          reject(new Error('Cancelled'))
        } else if (code === 0) {
          resolve()
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`))
        }
      })
  })
}
