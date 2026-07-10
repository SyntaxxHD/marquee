import { mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { loadConfig } from '../config.ts'
import { pickAds } from '../services/ads.ts'
import { assemblePreshow } from '../services/assemble.ts'
import { TrailerService } from '../services/trailers.ts'
import { logger } from '../utils/logger.ts'

export interface BuildResult {
  outputPath: string
}

export async function runBuild(): Promise<BuildResult> {
  const config = await loadConfig()
  await mkdir(config.outputDir, { recursive: true })

  const adCount = 3 + Math.floor(Math.random() * 3)

  logger.info(`📦 Picking ${adCount} ads...`)
  const ads = await pickAds(config.adsDir, adCount)
  ads.forEach((ad, i) => logger.step(i + 1, ads.length, ad.fileName))

  logger.info('🎥 Fetching 3 trailers...')
  const trailerService = new TrailerService(
    config.cacheDir,
    config.tmdbApiKey,
    config.language
  )
  await trailerService.init()
  const trailers = await trailerService.fetchTrailers(3)

  const files = [...ads.map(a => a.filePath), ...trailers.map(t => t.filePath)]

  const tmpDir = join(tmpdir(), `marquee-${Date.now()}`)

  const result = await assemblePreshow({
    files,
    outputDir: config.outputDir,
    tmpDir,
    resolution: config.outputResolution,
    fps: config.outputFps
  })

  logger.success(`Pre-show built: ${result.outputPath}`)
  return result
}
