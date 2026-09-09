import { stat } from 'fs/promises'
import { resolve, join } from 'path'

import envPaths from 'env-paths'

import type { StreamTargetConfig } from './backends/types.ts'
import type { LightsConfig } from './lights/types.ts'
import { MarqueeError } from './utils/errors.ts'

export type OutputResolution = '1920x1080' | '3840x2160'
export type OutputFps = 25 | 30 | 60
export type AdSource = 'auto' | 'local'
export type TrailerSource = 'auto' | 'local'

export interface UserConfig {
  tmdbApiKey: string
  adSource: AdSource
  adsDir: string
  adCount: number
  trailerSource: TrailerSource
  trailersDir: string
  trailerCount: number
  streamTarget: StreamTargetConfig | null
  language: string
  outputResolution: OutputResolution
  outputFps: OutputFps
  lights: LightsConfig | null
}

export interface Config {
  tmdbApiKey: string
  adSource: AdSource
  adsDir: string
  adCount: number
  trailerSource: TrailerSource
  trailersDir: string
  trailerCount: number
  cacheDir: string
  adsCacheDir: string
  streamTarget: StreamTargetConfig | null
  language: string
  outputResolution: OutputResolution
  outputFps: OutputFps
  lights: LightsConfig | null
}

const paths = envPaths('marquee', { suffix: '' })

export const CONFIG_DIR = paths.config
export const CACHE_DIR = join(paths.cache, 'trailers')
export const ADS_CACHE_DIR = join(paths.cache, 'ads')
export const OUTPUT_DIR = join(paths.cache, 'output')
export const BIN_CACHE_DIR = join(paths.cache, 'bin')
const USER_CONFIG_PATH = join(paths.config, 'config.json')
export const PYATV_STORAGE_FILE = join(paths.config, 'pyatv.json')

export async function loadUserConfig(): Promise<UserConfig | null> {
  const file = Bun.file(USER_CONFIG_PATH)
  if (!(await file.exists())) return null
  const raw = (await file.json()) as Record<string, unknown>

  if (raw.streamTarget === undefined && raw.appleTV) {
    const legacy = raw.appleTV as { name: string; id: string; address: string }
    raw.streamTarget = { type: 'appletv', ...legacy }
  }
  delete raw.appleTV

  if (raw.hue && !raw.lights) {
    raw.lights = { type: 'hue', ...(raw.hue as object) }
  }
  delete raw.hue

  return raw as unknown as UserConfig
}

export async function saveUserConfig(config: UserConfig): Promise<void> {
  const { mkdir } = await import('fs/promises')
  await mkdir(paths.config, { recursive: true })
  await Bun.write(USER_CONFIG_PATH, JSON.stringify(config, null, 2))
}

export async function loadConfig(): Promise<Config> {
  const userConfig = await loadUserConfig()
  if (!userConfig) {
    throw new MarqueeError('No configuration found. Run `marquee setup` first.')
  }

  const adSource: AdSource = userConfig.adSource ?? 'local'
  const trailerSource: TrailerSource = userConfig.trailerSource ?? 'auto'
  const adsDir = resolve(userConfig.adsDir)
  const trailersDir = resolve(userConfig.trailersDir ?? './trailers')

  if (trailerSource === 'auto' && !userConfig.tmdbApiKey) {
    throw new MarqueeError('No TMDB API key configured. Run `marquee setup` first.')
  }

  if (adSource === 'local') {
    try {
      await stat(adsDir)
    } catch {
      throw new MarqueeError(
        `Ads directory not found: ${adsDir}\nCreate it and add some video files, or re-run \`marquee setup\`.`
      )
    }
  }

  if (trailerSource === 'local') {
    try {
      await stat(trailersDir)
    } catch {
      throw new MarqueeError(
        `Trailers directory not found: ${trailersDir}\nCreate it and add some video files, or re-run \`marquee setup\`.`
      )
    }
  }

  return {
    tmdbApiKey: userConfig.tmdbApiKey,
    adSource,
    adsDir,
    adCount: userConfig.adCount ?? 4,
    trailerSource,
    trailersDir,
    trailerCount: userConfig.trailerCount ?? 3,
    cacheDir: CACHE_DIR,
    adsCacheDir: ADS_CACHE_DIR,
    streamTarget: userConfig.streamTarget,
    language: userConfig.language ?? 'de-DE',
    outputResolution: userConfig.outputResolution,
    outputFps: userConfig.outputFps,
    lights: userConfig.lights ?? null
  }
}
