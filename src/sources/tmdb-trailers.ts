import { CACHE_DIR } from '../config.ts'
import { TmdbClient } from '../services/tmdb.ts'
import { TrailerService } from '../services/trailers.ts'
import { TMDB_LANGUAGES } from '../shared/languages.ts'

import { SourceFieldType } from './types.ts'
import type {
  FetchCallbacks,
  SourceResult,
  TmdbTrailerConfig,
  VideoSelectionOptions,
  VideoSourcePlugin
} from './types.ts'

export const tmdbTrailersPlugin: VideoSourcePlugin<TmdbTrailerConfig> = {
  id: 'tmdb',
  label: 'Auto (TMDB)',
  description: 'Download trailers for trending movies via The Movie Database.',
  configFields: [
    {
      key: 'apiKey',
      type: SourceFieldType.Password,
      label: 'TMDB API Key',
      placeholder: 'v4 read access token',
      required: true
    },
    {
      key: 'language',
      type: SourceFieldType.Select,
      label: 'Language',
      options: TMDB_LANGUAGES,
      required: true
    }
  ],
  requiresValidation: true,
  async fetch(
    options: VideoSelectionOptions,
    config: TmdbTrailerConfig,
    callbacks: FetchCallbacks,
    signal?: AbortSignal
  ): Promise<SourceResult[]> {
    const service = new TrailerService(CACHE_DIR, config.apiKey, config.language)
    await service.init()
    const results = await service.fetchTrailers(
      options,
      callbacks.onPlanReady,
      callbacks.onItemStart,
      callbacks.onItemProgress,
      signal
    )
    return results.map(r => ({ filePath: r.filePath, title: r.title }))
  },
  async validate(config: TmdbTrailerConfig): Promise<boolean> {
    const client = new TmdbClient(config.apiKey, 'en')
    return client.validateApiKey()
  }
}
