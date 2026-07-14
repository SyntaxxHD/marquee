import { tmpdir } from 'os'
import { join } from 'path'

import { loadConfig, OUTPUT_DIR } from '../config.ts'
import { pickAds, pickLocalVideos } from '../services/ads.ts'
import type { AdResult } from '../services/ads.ts'
import { assemblePreshow } from '../services/assemble.ts'
import { LeaderboardAdService } from '../services/leaderboard-ads.ts'
import { TrailerService } from '../services/trailers.ts'
import { logger } from '../utils/logger.ts'
import { setActiveTmpDir } from '../utils/tmp.ts'

export interface BuildResult {
  outputPath: string
  tmpDir: string
}

export async function runBuild(): Promise<BuildResult> {
  const config = await loadConfig()

  const adCount = config.adCount
  const trailerCount = config.trailerCount

  let ads: AdResult[]
  if (config.adSource === 'auto') {
    logger.info(`📦 Fetching ${adCount} ads from the YouTube leaderboard...`)

    const adService = new LeaderboardAdService(config.adsCacheDir, config.language)
    await adService.init()
    ads = await adService.fetchAds(adCount)
  } else {
    logger.info(`📦 Picking ${adCount} ads...`)

    ads = await pickAds(config.adsDir, adCount)
    ads.forEach((ad, i) => logger.step(i + 1, ads.length, ad.fileName))
  }

  let trailers: string[]
  if (config.trailerSource === 'auto') {
    logger.info(`🎥 Fetching ${trailerCount} trailers...`)

    const trailerService = new TrailerService(
      config.cacheDir,
      config.tmdbApiKey,
      config.language
    )
    await trailerService.init()
    trailers = (await trailerService.fetchTrailers(trailerCount)).map(t => t.filePath)
  } else {
    logger.info(`🎥 Picking ${trailerCount} trailers...`)

    const picked = await pickLocalVideos(
      config.trailersDir,
      trailerCount,
      'trailer videos'
    )
    picked.forEach((t, i) => logger.step(i + 1, picked.length, t.fileName))
    trailers = picked.map(t => t.filePath)
  }

  const files = [...ads.map(a => a.filePath), ...trailers]

  const tmpDir = join(tmpdir(), `marquee-${Date.now()}`)
  setActiveTmpDir(tmpDir)

  const result = await assemblePreshow({
    files,
    tmpDir,
    outputDir: OUTPUT_DIR,
    resolution: config.outputResolution,
    fps: config.outputFps
  })

  logger.success(`Pre-show built: ${result.outputPath}`)
  return { outputPath: result.outputPath, tmpDir }
}
