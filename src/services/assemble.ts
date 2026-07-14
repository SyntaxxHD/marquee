import { mkdir, unlink, writeFile } from 'fs/promises'
import { join } from 'path'

import ffmpeg from 'fluent-ffmpeg'

import type { OutputResolution, OutputFps } from '../config.ts'
import { resolveBinaries } from '../utils/bins.ts'
import { MarqueeError } from '../utils/errors.ts'
import { exec } from '../utils/exec.ts'
import { logger } from '../utils/logger.ts'
import { createProgressBar } from '../utils/progress.ts'

export interface AssembleInput {
  files: string[]
  tmpDir: string
  outputDir: string
  resolution: OutputResolution
  fps: OutputFps
}

export interface AssembleResult {
  outputPath: string
}

const HW_ENCODERS = ['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf']

interface VideoEncoder {
  codec: string
  hardware: boolean
}

let cachedEncoder: VideoEncoder | null = null

async function pickVideoEncoder(ffmpegPath: string): Promise<VideoEncoder> {
  if (cachedEncoder) return cachedEncoder

  const result = await exec([ffmpegPath, '-hide_banner', '-encoders'], {
    captureOutput: true,
    silent: true
  })
  const available = result.stdout

  const hw = HW_ENCODERS.find(name => available.includes(name))
  cachedEncoder = hw
    ? { codec: hw, hardware: true }
    : { codec: 'libx264', hardware: false }

  logger.debug(`Using video encoder: ${cachedEncoder.codec}`)
  return cachedEncoder
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
  fps: OutputFps,
  encoder: VideoEncoder,
  step: string,
  label: string
): Promise<void> {
  const is4K = width >= 3840
  const bar = createProgressBar({ step, label })
  return new Promise((resolve, reject) => {
    const command = ffmpeg(input)
      .videoFilters([
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        'setsar=1'
      ])
      .fps(fps)
      .videoCodec(encoder.codec)

    if (encoder.hardware) {
      command.addOutputOption(`-b:v ${is4K ? '20M' : '8M'}`)
    } else {
      command
        .addOutputOption(`-preset ${is4K ? 'slow' : 'fast'}`)
        .addOutputOption('-crf 18')
    }

    command
      .audioCodec('aac')
      .audioBitrate('192k')
      .audioFrequency(48000)
      .audioChannels(2)
      .addOutputOption('-movflags +faststart')
      .output(output)
      .on('progress', p => bar.update(p.percent ?? 0))
      .on('end', () => {
        bar.finish()
        resolve()
      })
      .on('error', (err: Error) => {
        bar.finish()
        reject(new MarqueeError(`ffmpeg normalize failed: ${err.message}`))
      })
      .run()
  })
}

export async function assemblePreshow(input: AssembleInput): Promise<AssembleResult> {
  await mkdir(input.tmpDir, { recursive: true })
  await mkdir(input.outputDir, { recursive: true })

  const bins = await resolveBinaries()
  ffmpeg.setFfmpegPath(bins.ffmpeg)
  ffmpeg.setFfprobePath(bins.ffprobe)

  const encoder = await pickVideoEncoder(bins.ffmpeg)
  const { width, height } = parseResolution(input.resolution)
  const normalized: string[] = []
  const total = input.files.length

  const accel = encoder.hardware ? ' (hardware accelerated)' : ''
  logger.info(`🔧 Normalizing ${total} segment(s)${accel}...`)
  for (let i = 0; i < total; i++) {
    const file = input.files[i]
    const outPath = join(input.tmpDir, `normalized-${i}.mp4`)
    const label = file.split('/').pop() ?? file
    await normalizeSegment(
      file,
      outPath,
      width,
      height,
      input.fps,
      encoder,
      `[${i + 1}/${total}]`,
      label
    )
    normalized.push(outPath)
  }

  const concatList = normalized.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
  const concatFile = join(input.tmpDir, 'concat.txt')
  await writeFile(concatFile, concatList)

  const outputPath = join(input.outputDir, `marquee-${Date.now()}.mp4`)

  logger.info('✂️  Concatenating segments...')
  const concatBar = createProgressBar({ step: '[concat]', label: 'Joining' })
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy', '-movflags +faststart'])
      .output(outputPath)
      .on('progress', p => concatBar.update(p.percent ?? 0))
      .on('end', () => {
        concatBar.finish()
        resolve()
      })
      .on('error', (err: Error) => {
        concatBar.finish()
        reject(new MarqueeError(`ffmpeg concat failed: ${err.message}`))
      })
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
