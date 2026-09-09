import { join } from 'path'

import { TrailerCache } from '../utils/cache.ts'
import { MarqueeError } from '../utils/errors.ts'
import { downloadVideo } from '../utils/ytdlp.ts'

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

      const youtubeId = await this.tmdb.getTrailerKey(movie.id)
      if (!youtubeId) continue

      try {
        const result = await this.getOrDownload(youtubeId, movie.title)
        results.push(result)
      } catch (err) {
        console.warn(`Skipping "${movie.title}": ${(err as Error).message}`)
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
    await downloadVideo(youtubeId, outputPath)

    if (!(await Bun.file(outputPath).exists())) {
      throw new Error('Download completed but output file not found')
    }

    await this.cache.set(youtubeId, outputPath)
    return { youtubeId, filePath: outputPath, title, fromCache: false }
  }
}
