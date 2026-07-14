import { readdir } from 'fs/promises'

import chalk from 'chalk'

import { loadUserConfig } from '../config.ts'
import { validateHueConnection } from '../services/hue.ts'
import { regionForLanguage, leaderboardAdCount } from '../services/leaderboard-ads.ts'
import { TmdbClient } from '../services/tmdb.ts'
import { resolveBinaries } from '../utils/bins.ts'
import { logger } from '../utils/logger.ts'

function pass(msg: string) {
  console.log(chalk.green(`✅ ${msg}`))
}

function fail(msg: string) {
  console.log(chalk.red(`❌ ${msg}`))
}

function warn(msg: string) {
  console.log(chalk.yellow(`⚠️ ${msg}`))
}

export async function runCheck(): Promise<void> {
  console.log(chalk.bold('\n🔍 marquee - system check\n'))
  let ok = true

  try {
    const bins = await resolveBinaries()

    for (const [name, path] of [
      ['ffmpeg', bins.ffmpeg],
      ['ffprobe', bins.ffprobe],
      ['yt-dlp', bins.ytDlp],
      ['atvremote', bins.atvremote]
    ] as const) {
      if (await Bun.file(path).exists()) {
        pass(`${name} (${process.env.BUN_STANDALONE ? 'bundled' : 'vendor/'})`)
      } else {
        fail(`${name} not found at ${path}`)
        ok = false
      }
    }
  } catch (err) {
    fail(`Binary resolution failed: ${(err as Error).message}`)
    ok = false
  }

  const userConfig = await loadUserConfig()

  if (userConfig) {
    pass(
      `Config (Apple TV: ${userConfig.appleTV?.name ?? 'not set'}, ${userConfig.outputResolution} @ ${userConfig.outputFps}fps)`
    )
  } else {
    fail('No user config found. Run `marquee setup`')
    ok = false
  }

  const trailerSource = userConfig?.trailerSource ?? 'auto'

  if (trailerSource === 'auto') {
    const tmdbKey = userConfig?.tmdbApiKey

    if (!tmdbKey) {
      fail('No TMDB API key configured. Run `marquee setup`')
      ok = false
    } else {
      const tmdb = new TmdbClient(tmdbKey, 'en-US')

      if (await tmdb.validateApiKey()) {
        pass('TMDB API key valid')
      } else {
        fail('TMDB API key invalid or unreachable')
        ok = false
      }
    }
  } else {
    const trailersDir = userConfig?.trailersDir ?? './trailers'

    try {
      const entries = await readdir(trailersDir)
      const videos = entries.filter(f => /\.(mp4|mov|mkv|avi)$/i.test(f))

      if (videos.length > 0) {
        pass(
          `Trailers directory (${videos.length} video${videos.length === 1 ? '' : 's'} in ${trailersDir})`
        )
      } else {
        fail(`Trailers directory exists but contains no video files: ${trailersDir}`)
        ok = false
      }
    } catch {
      fail(`Trailers directory not found: ${trailersDir}`)
      ok = false
    }
  }

  if (userConfig?.adSource === 'auto') {
    const region = regionForLanguage(userConfig.language)

    if (!region) {
      fail(`No ad leaderboard region for language "${userConfig.language}"`)
      ok = false
    } else {
      try {
        const count = await leaderboardAdCount(region)
        pass(`Ad leaderboard reachable (${count} ads for region "${region}")`)
      } catch (err) {
        fail(`Ad leaderboard unreachable: ${(err as Error).message}`)
        ok = false
      }
    }
  } else {
    const adsDir = userConfig?.adsDir ?? './ads'

    try {
      const entries = await readdir(adsDir)
      const videos = entries.filter(f => /\.(mp4|mov|mkv|avi)$/i.test(f))

      if (videos.length > 0) {
        pass(
          `Ads directory (${videos.length} video${videos.length === 1 ? '' : 's'} in ${adsDir})`
        )
      } else {
        fail(`Ads directory exists but contains no video files: ${adsDir}`)
        ok = false
      }
    } catch {
      fail(`Ads directory not found: ${adsDir}`)
      ok = false
    }
  }

  if (userConfig?.hue) {
    const { bridgeIp, username, controlledLightIds } = userConfig.hue

    if (await validateHueConnection(bridgeIp, username)) {
      pass(
        `Hue bridge (${bridgeIp}, ${controlledLightIds.length} light${controlledLightIds.length === 1 ? '' : 's'} selected)`
      )
    } else {
      warn(`Hue bridge unreachable at ${bridgeIp}`)
    }
  } else {
    warn('Hue not configured (optional)')
  }

  console.log()
  if (ok) {
    logger.success('All checks passed. Ready to run!')
  } else {
    logger.error('Some checks failed. Fix the issues above and try again.')
    process.exit(1)
  }
}
