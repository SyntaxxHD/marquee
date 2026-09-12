import { tmpdir } from 'os'
import { join } from 'path'

import { loadConfig, OUTPUT_DIR, NORM_CACHE_DIR } from '../config.ts'
import { pickAds, pickLocalVideos } from '../services/ads.ts'
import type { AdResult, VideoSelectionOptions } from '../services/ads.ts'
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

function computeGrandTotal(
  adCount: number,
  trailerCount: number,
  adSourceAuto: boolean,
  trailerSourceAuto: boolean
): number {
  const downloadCount =
    (adSourceAuto ? adCount : 0) + (trailerSourceAuto ? trailerCount : 0)
  const normalizeCount = adCount + trailerCount
  return downloadCount + normalizeCount
}

export async function runBuild(
  signal?: AbortSignal,
  callbacks?: BuildCallbacks
): Promise<BuildResult> {
  const config = await loadConfig()

  const adOptions: VideoSelectionOptions = {
    selectionMode: config.adSelectionMode,
    count: config.adCount,
    targetMs: config.adTargetDurationMin * 60_000,
    maxLengthMs:
      config.adMaxVideoLengthMin !== null ? config.adMaxVideoLengthMin * 60_000 : null
  }
  const trailerOptions: VideoSelectionOptions = {
    selectionMode: config.trailerSelectionMode,
    count: config.trailerCount,
    targetMs: config.trailerTargetDurationMin * 60_000,
    maxLengthMs:
      config.trailerMaxVideoLengthMin !== null
        ? config.trailerMaxVideoLengthMin * 60_000
        : null
  }

  let localAds: AdResult[] | null = null
  let localTrailerItems: { filePath: string; title: string }[] | null = null

  if (config.adSource === 'local') {
    localAds = await pickAds(config.adsDir, adOptions)
  }
  if (config.trailerSource === 'local') {
    localTrailerItems = (
      await pickLocalVideos(config.trailersDir, trailerOptions, 'trailer videos')
    ).map(t => ({ filePath: t.filePath, title: t.title }))
  }

  let adCount = localAds ? localAds.length : config.adCount
  let trailerCount = localTrailerItems ? localTrailerItems.length : config.trailerCount
  let grandTotal = computeGrandTotal(
    adCount,
    trailerCount,
    config.adSource === 'auto',
    config.trailerSource === 'auto'
  )

  let ads: AdResult[]
  if (config.adSource === 'auto') {
    const adService = new LeaderboardAdService(config.adsCacheDir, config.adsLanguage)
    await adService.init()
    callbacks?.onLog?.(`Fetching ads…`)
    let currentAdIndex = 0
    let currentAdLabel = ''
    let lastAdPercent = 0
    ads = await adService.fetchAds(
      adOptions,
      count => {
        adCount = count
        grandTotal = computeGrandTotal(
          adCount,
          trailerCount,
          config.adSource === 'auto',
          config.trailerSource === 'auto'
        )
      },
      (index, title) => {
        lastAdPercent = 0
        currentAdIndex = index
        currentAdLabel = `Ad ${index + 1}: ${title}`
        callbacks?.onLog?.(`Downloading ad ${index + 1}: ${title}`)
        callbacks?.onProgress?.({
          label: currentAdLabel,
          itemIndex: index,
          itemTotal: grandTotal,
          itemPercent: 0
        })
      },
      percent => {
        if (percent <= lastAdPercent) {
          return
        }
        lastAdPercent = percent
        callbacks?.onProgress?.({
          label: currentAdLabel,
          itemIndex: currentAdIndex,
          itemTotal: grandTotal,
          itemPercent: percent
        })
      },
      signal
    )
  } else {
    ads = localAds!
  }

  let trailerItems: { filePath: string; title: string }[]
  if (config.trailerSource === 'auto') {
    const trailerService = new TrailerService(
      config.cacheDir,
      config.tmdbApiKey,
      config.language
    )
    await trailerService.init()
    callbacks?.onLog?.(`Fetching trailers…`)
    let currentTrailerIndex = 0
    let currentTrailerLabel = ''
    let lastTrailerPercent = 0
    trailerItems = (
      await trailerService.fetchTrailers(
        trailerOptions,
        count => {
          trailerCount = count
          grandTotal = computeGrandTotal(
            adCount,
            trailerCount,
            config.adSource === 'auto',
            config.trailerSource === 'auto'
          )
        },
        (index, title) => {
          lastTrailerPercent = 0
          currentTrailerIndex = index
          currentTrailerLabel = `Trailer ${index + 1}: ${title}`
          callbacks?.onLog?.(`Downloading trailer ${index + 1}: ${title}`)
          callbacks?.onProgress?.({
            label: currentTrailerLabel,
            itemIndex: adCount + index,
            itemTotal: grandTotal,
            itemPercent: 0
          })
        },
        percent => {
          if (percent <= lastTrailerPercent) {
            return
          }
          lastTrailerPercent = percent
          callbacks?.onProgress?.({
            label: currentTrailerLabel,
            itemIndex: adCount + currentTrailerIndex,
            itemTotal: grandTotal,
            itemPercent: percent
          })
        },
        signal
      )
    ).map(t => ({ filePath: t.filePath, title: t.title }))
  } else {
    trailerItems = localTrailerItems!
  }

  const files = [...ads.map(a => a.filePath), ...trailerItems.map(t => t.filePath)]

  const partialCues: BuildCue[] = [
    ...ads.map(a => ({ label: a.title, durationMs: null })),
    ...trailerItems.map(t => ({ label: t.title, durationMs: null }))
  ]

  await callbacks?.onDownloadsComplete?.(partialCues)
  const tmpDir = join(tmpdir(), `marquee-${Date.now()}`)
  setActiveTmpDir(tmpDir)

  const downloadCount =
    (config.adSource === 'auto' ? adCount : 0) +
    (config.trailerSource === 'auto' ? trailerCount : 0)

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
    signal,
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
    ...ads.map((a, i) => ({
      label: a.title,
      durationMs: result.segmentDurations[i] ?? null
    })),
    ...trailerItems.map((t, i) => ({
      label: t.title,
      durationMs: result.segmentDurations[ads.length + i] ?? null
    }))
  ]

  return { outputPath: result.outputPath, tmpDir, cues }
}
