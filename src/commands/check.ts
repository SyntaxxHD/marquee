import { readdir, mkdir, access, constants } from 'fs/promises'

import chalk from 'chalk'

import { loadUserConfig } from '../config.ts'
import { validateHueConnection } from '../services/hue.ts'
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

  const tmdbKey = Bun.env.TMDB_API_KEY
  if (!tmdbKey) {
    fail('TMDB_API_KEY not set in .env')
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

  const adsDir = Bun.env.ADS_DIR ?? './ads'
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

  const outputDir = Bun.env.OUTPUT_DIR ?? './output'
  try {
    await mkdir(outputDir, { recursive: true })
    await access(outputDir, constants.W_OK)
    pass(`Output directory writable (${outputDir})`)
  } catch {
    fail(`Output directory not writable: ${outputDir}`)
    ok = false
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
