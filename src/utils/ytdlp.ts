import _YTDlpWrap from 'yt-dlp-wrap'

import { resolveBinaries } from './bins.ts'

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

export async function downloadVideo(
  youtubeId: string,
  outputPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const bins = await resolveBinaries()
  const ytdlp = new YTDlpWrap(bins.ytDlp)

  await new Promise<void>((resolve, reject) => {
    ytdlp
      .exec([
        `https://www.youtube.com/watch?v=${youtubeId}`,
        '--extractor-args',
        'youtube:player_client=android',
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
      ])
      .on('progress', ({ percent }) => onProgress?.(percent ?? 0))
      .on('error', err => reject(new Error(summarizeError(err.message))))
      .on('close', code => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`))
        }
      })
  })
}
