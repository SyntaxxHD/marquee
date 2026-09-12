import { join } from 'path'

import { TrailerCache } from '../utils/cache.ts'
import { MarqueeError } from '../utils/errors.ts'
import { downloadVideo } from '../utils/ytdlp.ts'

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
    onItemStart?: (index: number, title: string) => void,
    onItemProgress?: (percent: number) => void
  ): Promise<TrailerResult[]> {
    const movies = await this.tmdb.getTrendingMovies()
    const results: TrailerResult[] = []
    let totalDurationMs = 0

    for (const movie of movies) {
      const done =
        options.selectionMode === 'duration'
          ? totalDurationMs >= options.targetMs
          : results.length >= options.count
      if (done) {
        break
      }

      const youtubeId = await this.tmdb.getTrailerKey(movie.id)
      if (!youtubeId) {
        continue
      }

      try {
        onItemStart?.(results.length, movie.title)
        const result = await this.getOrDownload(youtubeId, movie.title, onItemProgress)
        const duration = await probeFileDuration(result.filePath)

        if (
          options.maxLengthMs !== null &&
          duration !== null &&
          duration > options.maxLengthMs
        ) {
          continue
        }

        results.push(result)
        totalDurationMs += duration ?? 0
      } catch (err) {
        console.warn(`Skipping "${movie.title}": ${(err as Error).message}`)
      }
    }

    if (options.selectionMode === 'count' && results.length < options.count) {
      throw new MarqueeError(
        `Could only find ${results.length} of ${options.count} trailers. Try again later.`
      )
    }

    if (options.selectionMode === 'duration' && results.length === 0) {
      throw new MarqueeError(`Could not fetch any trailers. Try again later.`)
    }

    return results
  }

  private async getOrDownload(
    youtubeId: string,
    title: string,
    onProgress?: (percent: number) => void
  ): Promise<TrailerResult> {
    const cached = await this.cache.get(youtubeId)
    if (cached) {
      return { youtubeId, filePath: cached, title, fromCache: true }
    }

    const outputPath = join(this.cache['cacheDir'], `${youtubeId}.mp4`)
    await downloadVideo(youtubeId, outputPath, onProgress)

    if (!(await Bun.file(outputPath).exists())) {
      throw new Error('Download completed but output file not found')
    }

    await this.cache.set(youtubeId, outputPath)
    return { youtubeId, filePath: outputPath, title, fromCache: false }
  }
}
