import { TMDB } from 'tmdb-ts'
import type { AvailableLanguage } from 'tmdb-ts'

import { MarqueeError } from '../utils/errors.ts'
import { logger } from '../utils/logger.ts'

export interface TmdbMovie {
  id: number
  title: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export class TmdbClient {
  private client: TMDB
  private language: string

  constructor(apiKey: string, language: string) {
    this.client = new TMDB(apiKey)
    this.language = language
  }

  async getTrendingMovies(): Promise<TmdbMovie[]> {
    try {
      const result = await this.client.trending.trending('movie', 'week', {
        language: this.language as AvailableLanguage
      })
      return shuffle(
        result.results.map(m => ({
          id: m.id,
          title:
            (m as { title?: string; original_title?: string }).title ??
            (m as { original_title?: string }).original_title ??
            String(m.id)
        }))
      )
    } catch (err) {
      throw new MarqueeError(
        `Failed to fetch trending movies from TMDB: ${(err as Error).message}`
      )
    }
  }

  async getTrailerKey(movieId: number, title: string): Promise<string | null> {
    const tryFetch = async (language?: AvailableLanguage): Promise<string | null> => {
      try {
        const result = await this.client.movies.videos(
          movieId,
          language ? { language } : undefined
        )
        const trailers = result.results.filter(
          v => v.type === 'Trailer' && v.site === 'YouTube'
        )
        return trailers[0]?.key ?? null
      } catch {
        return null
      }
    }

    const key = await tryFetch(this.language as AvailableLanguage)
    if (key) return key
    logger.debug(`No ${this.language} trailer for "${title}", trying fallback`)
    return tryFetch()
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.client.configuration.getApiConfiguration()
      return true
    } catch {
      return false
    }
  }
}
