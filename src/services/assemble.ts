import { mkdir, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'

import ffmpeg from 'fluent-ffmpeg'

import type { OutputResolution, OutputFps } from '../config.ts'
import { resolveBinaries } from '../utils/bins.ts'
import { MarqueeError } from '../utils/errors.ts'
import { exec } from '../utils/exec.ts'

export interface AssembleInput {
  files: string[]
  tmpDir: string
  outputDir: string
  normCacheDir: string
  resolution: OutputResolution
  fps: OutputFps
  signal?: AbortSignal
  onSegmentStart?: (index: number, total: number) => void
  onSegmentProgress?: (percent: number) => void
}

export interface AssembleResult {
  outputPath: string
  segmentDurations: (number | null)[]
}

const HW_ENCODERS = ['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf']

interface VideoEncoder {
  codec: string
  hardware: boolean
}

let cachedEncoder: VideoEncoder | null = null

async function probeSegmentDuration(
  ffprobePath: string,
  filePath: string
): Promise<number | null> {
  const result = await exec(
    [ffprobePath, '-v', 'quiet', '-print_format', 'json', '-show_format', filePath],
    { captureOutput: true, silent: true }
  )
  if (result.exitCode !== 0) {
    return null
  }
  try {
    const json = JSON.parse(result.stdout) as { format?: { duration?: string } }
    const seconds = parseFloat(json.format?.duration ?? '')
    return isNaN(seconds) ? null : seconds * 1000
  } catch {
    return null
  }
}

async function pickVideoEncoder(ffmpegPath: string): Promise<VideoEncoder> {
  if (cachedEncoder) {
    return cachedEncoder
  }

  const result = await exec([ffmpegPath, '-hide_banner', '-encoders'], {
    captureOutput: true,
    silent: true
  })

  const hw = HW_ENCODERS.find(name => result.stdout.includes(name))
  cachedEncoder = hw
    ? { codec: hw, hardware: true }
    : { codec: 'libx264', hardware: false }

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
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const is4K = width >= 3840
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Cancelled'))
      return
    }
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
      .on('progress', ({ percent }: { percent?: number }) => onProgress?.(percent ?? 0))
      .on('end', () => resolve())
      .on('error', (err: Error) => {
        if (signal?.aborted) {
          reject(new Error('Cancelled'))
        } else {
          reject(new MarqueeError(`ffmpeg normalize failed: ${err.message}`))
        }
      })
      .run()

    signal?.addEventListener('abort', () => command.kill('SIGKILL'), { once: true })
  })
}

export async function assemblePreshow(input: AssembleInput): Promise<AssembleResult> {
  await mkdir(input.tmpDir, { recursive: true })
  await mkdir(input.outputDir, { recursive: true })
  await mkdir(input.normCacheDir, { recursive: true })

  const bins = await resolveBinaries()
  ffmpeg.setFfmpegPath(bins.ffmpeg)
  ffmpeg.setFfprobePath(bins.ffprobe)

  const encoder = await pickVideoEncoder(bins.ffmpeg)
  const { width, height } = parseResolution(input.resolution)
  const normalized: string[] = []
  const total = input.files.length

  for (let i = 0; i < total; i++) {
    const file = input.files[i]
    const key = `${basename(file, extname(file))}_${Bun.hash(`${file}|${width}x${height}|${input.fps}|${encoder.codec}`).toString(16)}`
    const cachedPath = join(input.normCacheDir, `${key}.mp4`)
    input.onSegmentStart?.(i, total)

    if (await Bun.file(cachedPath).exists()) {
      input.onSegmentProgress?.(100)
      normalized.push(cachedPath)
      continue
    }

    await normalizeSegment(
      file,
      cachedPath,
      width,
      height,
      input.fps,
      encoder,
      input.onSegmentProgress,
      input.signal
    )

    normalized.push(cachedPath)
  }

  const concatList = normalized.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
  const concatFile = join(input.tmpDir, 'concat.txt')
  await writeFile(concatFile, concatList)

  const segmentDurations = await Promise.all(
    normalized.map(f => probeSegmentDuration(bins.ffprobe, f))
  )

  const outputPath = join(input.outputDir, `marquee-${Date.now()}.mp4`)

  await new Promise<void>((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(new Error('Cancelled'))
      return
    }
    const command = ffmpeg()
      .input(concatFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => {
        if (input.signal?.aborted) {
          reject(new Error('Cancelled'))
        } else {
          reject(new MarqueeError(`ffmpeg concat failed: ${err.message}`))
        }
      })
    input.signal?.addEventListener('abort', () => command.kill('SIGKILL'), { once: true })
    command.run()
  })

  return { outputPath, segmentDurations }
}

export async function concatSegments(
  files: string[],
  tmpDir: string,
  outputPath: string,
  signal?: AbortSignal
): Promise<void> {
  const bins = await resolveBinaries()
  ffmpeg.setFfmpegPath(bins.ffmpeg)

  const concatList = files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
  const concatFile = join(tmpDir, 'concat.txt')
  await writeFile(concatFile, concatList)

  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Cancelled'))
      return
    }
    const command = ffmpeg()
      .input(concatFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => {
        if (signal?.aborted) {
          reject(new Error('Cancelled'))
        } else {
          reject(new MarqueeError(`ffmpeg concat failed: ${err.message}`))
        }
      })
    signal?.addEventListener('abort', () => command.kill('SIGKILL'), { once: true })
    command.run()
  })
}
