import YTDlpWrap from 'yt-dlp-wrap'

import { resolveBinaries } from './bins.ts'
import { createProgressBar } from './progress.ts'

const YTDLP_FORMAT =
  'bestvideo[ext=mp4][height<=2160]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best[ext=mp4]/best'

export interface DownloadOptions {
  step: string
  label: string
}

function summarizeError(raw: string): string {
  const errorLine = raw
    .split('\n')
    .map(l => l.trim())
    .find(l => l.startsWith('ERROR:'))
  if (errorLine) {
    return errorLine.replace(/^ERROR:\s*/, '').replace(/^\[[^\]]+\]\s*/, '')
  }
  return raw.split('\n')[0]?.trim() || 'download failed'
}

export async function downloadVideo(
  youtubeId: string,
  outputPath: string,
  opts: DownloadOptions
): Promise<void> {
  const bins = await resolveBinaries()
  const ytdlp = new YTDlpWrap(bins.ytDlp)
  const bar = createProgressBar({ step: opts.step, label: opts.label })

  await new Promise<void>((resolve, reject) => {
    ytdlp
      .exec([
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
      ])
      .on('progress', progress => {
        bar.update(progress.percent ?? 0)
      })
      .on('error', err => {
        bar.finish()
        reject(new Error(summarizeError(err.message)))
      })
      .on('close', code => {
        bar.finish()
        if (code === 0) resolve()
        else reject(new Error(`yt-dlp exited with code ${code}`))
      })
  })
}
