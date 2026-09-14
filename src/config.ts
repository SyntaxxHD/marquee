import { stat } from 'fs/promises'
import { resolve, join } from 'path'

import envPaths from 'env-paths'

import type { StreamTargetConfig } from './backends/types.ts'
import type { LightsConfig } from './lights/types.ts'
import type { AdSourceConfig, TrailerSourceConfig } from './sources/types.ts'
import { MarqueeError } from './utils/errors.ts'

export type OutputResolution = '1920x1080' | '3840x2160'
export type OutputFps = 25 | 30 | 60
export type SelectionMode = 'count' | 'duration'

export interface UserConfig {
  adSourceConfig: AdSourceConfig
  adCount: number
  adSelectionMode: SelectionMode
  adTargetDurationMin: number
  adMaxVideoLengthMin: number | null
  trailerSourceConfig: TrailerSourceConfig
  trailerCount: number
  trailerSelectionMode: SelectionMode
  trailerTargetDurationMin: number
  trailerMaxVideoLengthMin: number | null
  streamTarget: StreamTargetConfig | null
  outputResolution: OutputResolution
  outputFps: OutputFps
  lights: LightsConfig | null
}

export interface Config {
  adSourceConfig: AdSourceConfig
  adCount: number
  adSelectionMode: SelectionMode
  adTargetDurationMin: number
  adMaxVideoLengthMin: number | null
  trailerSourceConfig: TrailerSourceConfig
  trailerCount: number
  trailerSelectionMode: SelectionMode
  trailerTargetDurationMin: number
  trailerMaxVideoLengthMin: number | null
  cacheDir: string
  adsCacheDir: string
  streamTarget: StreamTargetConfig | null
  outputResolution: OutputResolution
  outputFps: OutputFps
  lights: LightsConfig | null
}

const paths = envPaths('marquee', { suffix: '' })

export const CONFIG_DIR = paths.config
export const CACHE_DIR = join(paths.cache, 'trailers')
export const ADS_CACHE_DIR = join(paths.cache, 'ads')
export const OUTPUT_DIR = join(paths.cache, 'output')
export const NORM_CACHE_DIR = join(paths.cache, 'normalized')
export const BIN_CACHE_DIR = join(paths.cache, 'bin')
const USER_CONFIG_PATH = join(paths.config, 'config.json')
export const PYATV_STORAGE_FILE = join(paths.config, 'pyatv.json')

export async function loadUserConfig(): Promise<UserConfig | null> {
  const file = Bun.file(USER_CONFIG_PATH)
  if (!(await file.exists())) {
    return null
  }
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

  if (!raw.adSourceConfig) {
    raw.adSourceConfig =
      raw.adSource === 'auto'
        ? { type: 'leaderboard', language: raw.adsLanguage ?? 'en-US' }
        : { type: 'local', dir: raw.adsDir ?? '' }
    delete raw.adSource
    delete raw.adsDir
    delete raw.adsLanguage
  }

  if (!raw.trailerSourceConfig) {
    raw.trailerSourceConfig =
      raw.trailerSource === 'auto'
        ? {
            type: 'tmdb',
            apiKey: raw.tmdbApiKey ?? '',
            language: raw.language ?? 'en-US'
          }
        : { type: 'local', dir: raw.trailersDir ?? '' }
    delete raw.trailerSource
    delete raw.trailersDir
    delete raw.tmdbApiKey
    delete raw.language
  }

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

  const adSourceConfig = userConfig.adSourceConfig ?? { type: 'local', dir: '' }
  const trailerSourceConfig = userConfig.trailerSourceConfig ?? { type: 'local', dir: '' }

  if (adSourceConfig.type === 'local') {
    try {
      await stat(resolve(adSourceConfig.dir))
    } catch {
      throw new MarqueeError(
        `Ads directory not found: ${adSourceConfig.dir}\nCreate it and add some video files, or re-run \`marquee setup\`.`
      )
    }
  }

  if (trailerSourceConfig.type === 'local') {
    try {
      await stat(resolve(trailerSourceConfig.dir))
    } catch {
      throw new MarqueeError(
        `Trailers directory not found: ${trailerSourceConfig.dir}\nCreate it and add some video files, or re-run \`marquee setup\`.`
      )
    }
  }

  if (trailerSourceConfig.type === 'tmdb' && !trailerSourceConfig.apiKey) {
    throw new MarqueeError('No TMDB API key configured. Run `marquee setup` first.')
  }

  return {
    adSourceConfig,
    adCount: userConfig.adCount ?? 4,
    adSelectionMode: userConfig.adSelectionMode ?? 'count',
    adTargetDurationMin: userConfig.adTargetDurationMin ?? 5,
    adMaxVideoLengthMin:
      userConfig.adMaxVideoLengthMin !== undefined ? userConfig.adMaxVideoLengthMin : 1,
    trailerSourceConfig,
    trailerCount: userConfig.trailerCount ?? 3,
    trailerSelectionMode: userConfig.trailerSelectionMode ?? 'count',
    trailerTargetDurationMin: userConfig.trailerTargetDurationMin ?? 10,
    trailerMaxVideoLengthMin:
      userConfig.trailerMaxVideoLengthMin !== undefined
        ? userConfig.trailerMaxVideoLengthMin
        : null,
    cacheDir: CACHE_DIR,
    adsCacheDir: ADS_CACHE_DIR,
    streamTarget: userConfig.streamTarget,
    outputResolution: userConfig.outputResolution,
    outputFps: userConfig.outputFps,
    lights: userConfig.lights ?? null
  }
}
