import { tmpdir } from 'os'
import { join } from 'path'

import { loadConfig, OUTPUT_DIR } from '../config.ts'
import { pickAds, pickLocalVideos } from '../services/ads.ts'
import type { AdResult } from '../services/ads.ts'
import { assemblePreshow } from '../services/assemble.ts'
import { LeaderboardAdService } from '../services/leaderboard-ads.ts'
import { TrailerService } from '../services/trailers.ts'
import { setActiveTmpDir } from '../utils/tmp.ts'

export interface BuildCue {
  label: string
  durationMs: number | null
}

export interface BuildResult {
  outputPath: string
  tmpDir: string
  cues: BuildCue[]
}

export async function runBuild(): Promise<BuildResult> {
  const config = await loadConfig()

  const adCount = config.adCount
  const trailerCount = config.trailerCount

  let ads: AdResult[]
  if (config.adSource === 'auto') {
    const adService = new LeaderboardAdService(config.adsCacheDir, config.language)
    await adService.init()
    ads = await adService.fetchAds(adCount)
  } else {
    ads = await pickAds(config.adsDir, adCount)
  }

  let trailers: string[]
  if (config.trailerSource === 'auto') {
    const trailerService = new TrailerService(
      config.cacheDir,
      config.tmdbApiKey,
      config.language
    )
    await trailerService.init()
    trailers = (await trailerService.fetchTrailers(trailerCount)).map(t => t.filePath)
  } else {
    const picked = await pickLocalVideos(
      config.trailersDir,
      trailerCount,
      'trailer videos'
    )
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

  const cues: BuildCue[] = [
    ...ads.map(a => ({ label: a.fileName, durationMs: null })),
    ...trailers.map(t => ({ label: t.split('/').pop() ?? t, durationMs: null }))
  ]

  return { outputPath: result.outputPath, tmpDir, cues }
}
