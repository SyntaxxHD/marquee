import { join } from 'path'

import { TrailerCache } from '../utils/cache.ts'
import { MarqueeError } from '../utils/errors.ts'
import { downloadVideo, getVideoInfo } from '../utils/ytdlp.ts'

import type { VideoSelectionOptions } from './ads.ts'
import { probeFileDuration } from './player.ts'
import { TmdbClient } from './tmdb.ts'

export interface TrailerResult {
  youtubeId: string
  filePath: string
  title: string
  fromCache: boolean
}

export class TrailerService {
  private cache: TrailerCache
  private tmdb: TmdbClient

  constructor(cacheDir: string, tmdbApiKey: string, language: string) {
    this.cache = new TrailerCache(cacheDir)
    this.tmdb = new TmdbClient(tmdbApiKey, language)
  }

  async init(): Promise<void> {
    await this.cache.init()
  }

  async fetchTrailers(
    options: VideoSelectionOptions,
    onPlanReady?: (count: number) => void,
    onItemStart?: (index: number, title: string) => void,
    onItemProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<TrailerResult[]> {
    if (options.selectionMode === 'duration') {
      return this.fetchTrailersByDuration(
        options,
        onPlanReady,
        onItemStart,
        onItemProgress,
        signal
      )
    }

    const movies = await this.tmdb.getTrendingMovies()
    const results: TrailerResult[] = []

    for (const movie of movies) {
      if (results.length >= options.count) {
        break
      }

      const youtubeId = await this.tmdb.getTrailerKey(movie.id)
      if (!youtubeId) {
        continue
      }

      try {
        onItemStart?.(results.length, movie.title)
        const result = await this.getOrDownload(
          youtubeId,
          movie.title,
          onItemProgress,
          signal
        )
        const duration = await probeFileDuration(result.filePath)

        if (
          options.maxLengthMs !== null &&
          duration !== null &&
          duration > options.maxLengthMs
        ) {
          continue
        }

        results.push(result)
      } catch (err) {
        console.warn(`Skipping "${movie.title}": ${(err as Error).message}`)
      }
    }

    if (results.length < options.count) {
      throw new MarqueeError(
        `Could only find ${results.length} of ${options.count} trailers. Try again later.`
      )
    }

    return results
  }

  private async fetchTrailersByDuration(
    options: VideoSelectionOptions,
    onPlanReady?: (count: number) => void,
    onItemStart?: (index: number, title: string) => void,
    onItemProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<TrailerResult[]> {
    const movies = await this.tmdb.getTrendingMovies()

    interface PlannedTrailer {
      youtubeId: string
      title: string
      cachedPath: string | null
      durationMs: number
    }

    const planned: PlannedTrailer[] = []
    let totalMs = 0

    for (const movie of movies) {
      if (totalMs >= options.targetMs) {
        break
      }

      const youtubeId = await this.tmdb.getTrailerKey(movie.id)
      if (!youtubeId) {
        continue
      }

      const cachedPath = await this.cache.get(youtubeId)
      let durationMs: number | null

      if (cachedPath) {
        durationMs = await probeFileDuration(cachedPath)
      } else {
        const info = await getVideoInfo(youtubeId)
        durationMs = info?.durationMs ?? null
      }

      if (durationMs === null) {
        continue
      }
      if (options.maxLengthMs !== null && durationMs > options.maxLengthMs) {
        continue
      }

      planned.push({ youtubeId, title: movie.title, cachedPath, durationMs })
      totalMs += durationMs
    }

    if (planned.length === 0) {
      throw new MarqueeError(
        `Could not find any trailers matching the filter. Try again later.`
      )
    }

    onPlanReady?.(planned.length)

    const results: TrailerResult[] = []
    for (const item of planned) {
      onItemStart?.(results.length, item.title)
      const result = item.cachedPath
        ? {
            youtubeId: item.youtubeId,
            filePath: item.cachedPath,
            title: item.title,
            fromCache: true
          }
        : await this.getOrDownload(item.youtubeId, item.title, onItemProgress, signal)
      results.push(result)
    }

    return results
  }

  private async getOrDownload(
    youtubeId: string,
    title: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<TrailerResult> {
    const cached = await this.cache.get(youtubeId)
    if (cached) {
      return { youtubeId, filePath: cached, title, fromCache: true }
    }

    const outputPath = join(this.cache['cacheDir'], `${youtubeId}.mp4`)
    await downloadVideo(youtubeId, outputPath, onProgress, signal)

    if (!(await Bun.file(outputPath).exists())) {
      throw new Error('Download completed but output file not found')
    }

    await this.cache.set(youtubeId, outputPath)
    return { youtubeId, filePath: outputPath, title, fromCache: false }
  }
}
