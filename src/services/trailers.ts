import { join } from 'path'

import YTDlpWrap from 'yt-dlp-wrap'

import { resolveBinaries } from '../utils/bins.ts'
import { TrailerCache } from '../utils/cache.ts'
import { MarqueeError } from '../utils/errors.ts'
import { logger } from '../utils/logger.ts'

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

  async fetchTrailers(count: number): Promise<TrailerResult[]> {
    const movies = await this.tmdb.getTrendingMovies()
    const results: TrailerResult[] = []

    for (const movie of movies) {
      if (results.length >= count) break

      const youtubeId = await this.tmdb.getTrailerKey(movie.id, movie.title)
      if (!youtubeId) {
        logger.debug(`No trailer found for "${movie.title}"`)
        continue
      }

      try {
        const result = await this.getOrDownload(youtubeId, movie.title)
        results.push(result)
        logger.step(
          results.length,
          count,
          `${movie.title}${result.fromCache ? ' (cached)' : ''}`
        )
      } catch (err) {
        logger.warn(`Skipping "${movie.title}": ${(err as Error).message}`)
      }
    }

    if (results.length < count) {
      throw new MarqueeError(
        `Could only find ${results.length} of ${count} trailers. Try again later.`
      )
    }

    return results
  }

  private async getOrDownload(youtubeId: string, title: string): Promise<TrailerResult> {
    const cached = await this.cache.get(youtubeId)
    if (cached) {
      return { youtubeId, filePath: cached, title, fromCache: true }
    }

    const outputPath = join(this.cache['cacheDir'], `${youtubeId}.mp4`)
    logger.debug(`Downloading trailer: ${title} (${youtubeId})`)

    const bins = await resolveBinaries()
    const ytdlp = new YTDlpWrap(bins.ytDlp)

    await ytdlp.execPromise([
      `https://www.youtube.com/watch?v=${youtubeId}`,
      '-f',
      'bestvideo[ext=mp4][height<=2160]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best[ext=mp4]/best',
      '--merge-output-format',
      'mp4',
      '--no-playlist',
      '-o',
      outputPath
    ])

    if (!(await Bun.file(outputPath).exists())) {
      throw new Error('Download completed but output file not found')
    }

    await this.cache.set(youtubeId, outputPath)
    return { youtubeId, filePath: outputPath, title, fromCache: false }
  }
}
