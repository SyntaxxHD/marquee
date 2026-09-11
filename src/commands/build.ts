import { tmpdir } from 'os'
import { join } from 'path'

import { loadConfig, OUTPUT_DIR, NORM_CACHE_DIR } from '../config.ts'
import { pickAds, pickLocalVideos } from '../services/ads.ts'
import type { AdResult } from '../services/ads.ts'
import { assemblePreshow } from '../services/assemble.ts'
import { LeaderboardAdService } from '../services/leaderboard-ads.ts'
import { TrailerService } from '../services/trailers.ts'
import type { BuildProgress } from '../shared/app-state.ts'
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

export interface BuildCallbacks {
  onLog?: (message: string) => void
  onProgress?: (progress: BuildProgress) => void
  onDownloadsComplete?: (cues: BuildCue[]) => Promise<void>
}

export async function runBuild(callbacks?: BuildCallbacks): Promise<BuildResult> {
  const config = await loadConfig()

  const adCount = config.adCount
  const trailerCount = config.trailerCount
  const downloadCount =
    (config.adSource === 'auto' ? adCount : 0) +
    (config.trailerSource === 'auto' ? trailerCount : 0)
  const normalizeCount = adCount + trailerCount
  const grandTotal = downloadCount + normalizeCount

  let ads: AdResult[]
  if (config.adSource === 'auto') {
    const adService = new LeaderboardAdService(config.adsCacheDir, config.adsLanguage)
    await adService.init()
    callbacks?.onLog?.(`Fetching ${adCount} ads…`)
    let currentAdIndex = 0
    let currentAdLabel = ''
    ads = await adService.fetchAds(
      adCount,
      (index, title) => {
        currentAdIndex = index
        currentAdLabel = `Ad ${index + 1} / ${adCount}: ${title}`
        callbacks?.onLog?.(`Downloading ad ${index + 1} / ${adCount}: ${title}`)
        callbacks?.onProgress?.({
          label: currentAdLabel,
          itemIndex: index,
          itemTotal: grandTotal,
          itemPercent: 0
        })
      },
      percent =>
        callbacks?.onProgress?.({
          label: currentAdLabel,
          itemIndex: currentAdIndex,
          itemTotal: grandTotal,
          itemPercent: percent
        })
    )
  } else {
    ads = await pickAds(config.adsDir, adCount)
  }

  let trailerItems: { filePath: string; title: string }[]
  if (config.trailerSource === 'auto') {
    const trailerService = new TrailerService(
      config.cacheDir,
      config.tmdbApiKey,
      config.language
    )
    await trailerService.init()
    callbacks?.onLog?.(`Fetching ${trailerCount} trailers…`)
    let currentTrailerIndex = 0
    let currentTrailerLabel = ''
    trailerItems = (
      await trailerService.fetchTrailers(
        trailerCount,
        (index, title) => {
          currentTrailerIndex = index
          currentTrailerLabel = `Trailer ${index + 1} / ${trailerCount}: ${title}`
          callbacks?.onLog?.(
            `Downloading trailer ${index + 1} / ${trailerCount}: ${title}`
          )
          callbacks?.onProgress?.({
            label: currentTrailerLabel,
            itemIndex: adCount + index,
            itemTotal: grandTotal,
            itemPercent: 0
          })
        },
        percent =>
          callbacks?.onProgress?.({
            label: currentTrailerLabel,
            itemIndex: adCount + currentTrailerIndex,
            itemTotal: grandTotal,
            itemPercent: percent
          })
      )
    ).map(t => ({ filePath: t.filePath, title: t.title }))
  } else {
    const picked = await pickLocalVideos(
      config.trailersDir,
      trailerCount,
      'trailer videos'
    )
    trailerItems = picked.map(t => ({ filePath: t.filePath, title: t.title }))
  }

  const files = [...ads.map(a => a.filePath), ...trailerItems.map(t => t.filePath)]

  const partialCues: BuildCue[] = [
    ...ads.map(a => ({ label: a.title, durationMs: null })),
    ...trailerItems.map(t => ({ label: t.title, durationMs: null }))
  ]

  await callbacks?.onDownloadsComplete?.(partialCues)
  const tmpDir = join(tmpdir(), `marquee-${Date.now()}`)
  setActiveTmpDir(tmpDir)

  callbacks?.onLog?.(`Normalizing ${files.length} segments…`)
  let currentSegmentIndex = 0
  let currentSegmentLabel = ''
  const result = await assemblePreshow({
    files,
    tmpDir,
    outputDir: OUTPUT_DIR,
    normCacheDir: NORM_CACHE_DIR,
    resolution: config.outputResolution,
    fps: config.outputFps,
    onSegmentStart: (index, total) => {
      currentSegmentIndex = downloadCount + index
      currentSegmentLabel = `Normalizing ${index + 1} / ${total}`
      callbacks?.onLog?.(currentSegmentLabel)
      callbacks?.onProgress?.({
        label: currentSegmentLabel,
        itemIndex: currentSegmentIndex,
        itemTotal: grandTotal,
        itemPercent: 0
      })
    },
    onSegmentProgress: percent =>
      callbacks?.onProgress?.({
        label: currentSegmentLabel,
        itemIndex: currentSegmentIndex,
        itemTotal: grandTotal,
        itemPercent: percent
      })
  })

  const cues: BuildCue[] = [
    ...ads.map(a => ({ label: a.title, durationMs: null })),
    ...trailerItems.map(t => ({ label: t.title, durationMs: null }))
  ]

  return { outputPath: result.outputPath, tmpDir, cues }
}
