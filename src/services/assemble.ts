import { mkdir, unlink, writeFile } from 'fs/promises'
import { join } from 'path'

import ffmpeg from 'fluent-ffmpeg'

import type { OutputResolution, OutputFps } from '../config.ts'
import { resolveBinaries } from '../utils/bins.ts'
import { MarqueeError } from '../utils/errors.ts'
import { logger } from '../utils/logger.ts'

export interface AssembleInput {
  files: string[]
  outputDir: string
  tmpDir: string
  resolution: OutputResolution
  fps: OutputFps
}

export interface AssembleResult {
  outputPath: string
}

function parseResolution(res: OutputResolution): { width: number; height: number } {
  const [w, h] = res.split('x').map(Number)
  return { width: w, height: h }
}

function normalizeSegment(
  input: string,
  output: string,
  width: number,
  height: number,
  fps: OutputFps
): Promise<void> {
  const is4K = width >= 3840
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoFilters([
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        'setsar=1'
      ])
      .fps(fps)
      .videoCodec('libx264')
      .addOutputOption(`-preset ${is4K ? 'slow' : 'fast'}`)
      .addOutputOption('-crf 18')
      .audioCodec('aac')
      .audioBitrate('192k')
      .audioFrequency(48000)
      .audioChannels(2)
      .addOutputOption('-movflags +faststart')
      .output(output)
      .on('end', () => resolve())
      .on('error', (err: Error) =>
        reject(new MarqueeError(`ffmpeg normalize failed: ${err.message}`))
      )
      .run()
  })
}

export async function assemblePreshow(input: AssembleInput): Promise<AssembleResult> {
  await mkdir(input.tmpDir, { recursive: true })
  await mkdir(input.outputDir, { recursive: true })

  const bins = await resolveBinaries()
  ffmpeg.setFfmpegPath(bins.ffmpeg)
  ffmpeg.setFfprobePath(bins.ffprobe)

  const { width, height } = parseResolution(input.resolution)
  const normalized: string[] = []
  const total = input.files.length

  logger.info(`🔧 Normalizing ${total} segment(s)...`)
  for (let i = 0; i < total; i++) {
    const file = input.files[i]
    const outPath = join(input.tmpDir, `normalized-${i}.mp4`)
    logger.step(i + 1, total, file.split('/').pop() ?? file)
    await normalizeSegment(file, outPath, width, height, input.fps)
    normalized.push(outPath)
  }

  const concatList = normalized.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
  const concatFile = join(input.tmpDir, 'concat.txt')
  await writeFile(concatFile, concatList)

  const timestamp = Date.now()
  const outputPath = join(input.outputDir, `marquee-${timestamp}.mp4`)

  logger.info('✂️  Concatenating segments...')
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) =>
        reject(new MarqueeError(`ffmpeg concat failed: ${err.message}`))
      )
      .run()
  })

  logger.debug('Cleaning up normalized intermediates...')
  for (const f of normalized) {
    try {
      await unlink(f)
    } catch (err) {
      logger.debug(`Could not remove ${f}: ${(err as Error).message}`)
    }
  }

  return { outputPath }
}
