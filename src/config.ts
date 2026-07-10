import { stat } from 'fs/promises'
import { homedir } from 'os'
import { resolve, join } from 'path'

import { MarqueeError } from './utils/errors.ts'

export type OutputResolution = '1920x1080' | '3840x2160'
export type OutputFps = 25 | 30 | 60

export interface AppleTVConfig {
  name: string
  id: string
}

export interface UserConfig {
  appleTV: AppleTVConfig | null
  language: string
  outputResolution: OutputResolution
  outputFps: OutputFps
  hue: {
    bridgeIp: string
    username: string
    controlledLightIds: string[]
  } | null
}

export interface Config {
  tmdbApiKey: string
  adsDir: string
  outputDir: string
  cacheDir: string
  appleTV: AppleTVConfig | null
  language: string
  outputResolution: OutputResolution
  outputFps: OutputFps
  hue: UserConfig['hue']
}

const USER_CONFIG_PATH = join(homedir(), '.config', 'marquee', 'config.json')
export const CACHE_DIR = join(homedir(), '.cache', 'marquee', 'trailers')

export async function loadUserConfig(): Promise<UserConfig | null> {
  const file = Bun.file(USER_CONFIG_PATH)
  if (!(await file.exists())) return null
  return file.json()
}

export async function saveUserConfig(config: UserConfig): Promise<void> {
  const { mkdir } = await import('fs/promises')
  await mkdir(join(homedir(), '.config', 'marquee'), { recursive: true })
  await Bun.write(USER_CONFIG_PATH, JSON.stringify(config, null, 2))
}

export async function loadConfig(): Promise<Config> {
  const missing: string[] = []

  const tmdbApiKey = Bun.env.TMDB_API_KEY
  if (!tmdbApiKey) missing.push('TMDB_API_KEY')

  if (missing.length > 0) {
    throw new MarqueeError(
      `Missing required environment variables: ${missing.join(', ')}\nCopy .env.example to .env and fill in the values.`
    )
  }

  const adsDir = resolve(Bun.env.ADS_DIR ?? './ads')
  const outputDir = resolve(Bun.env.OUTPUT_DIR ?? './output')

  try {
    await stat(adsDir)
  } catch {
    throw new MarqueeError(
      `Ads directory not found: ${adsDir}\nCreate it and add some video files.`
    )
  }

  const userConfig = await loadUserConfig()
  if (!userConfig) {
    throw new MarqueeError('No configuration found. Run `marquee setup` first.')
  }

  return {
    tmdbApiKey: tmdbApiKey!,
    adsDir,
    outputDir,
    cacheDir: CACHE_DIR,
    appleTV: userConfig.appleTV,
    language: userConfig.language ?? 'de-DE',
    outputResolution: userConfig.outputResolution,
    outputFps: userConfig.outputFps,
    hue: userConfig.hue
  }
}
