import { ADS_CACHE_DIR } from '../config.ts'
import { LeaderboardAdService } from '../services/leaderboard-ads.ts'
import { ADS_LANGUAGES } from '../shared/languages.ts'

import { SourceFieldType } from './types.ts'
import type {
  FetchCallbacks,
  LeaderboardAdConfig,
  SourceResult,
  VideoSelectionOptions,
  VideoSourcePlugin
} from './types.ts'

export const leaderboardPlugin: VideoSourcePlugin<LeaderboardAdConfig> = {
  id: 'leaderboard',
  label: 'YouTube Ads Leaderboard',
  description: 'Download top ads from the YouTube Ads Leaderboard.',
  configFields: [
    {
      key: 'language',
      type: SourceFieldType.Select,
      label: 'Language / Region',
      options: ADS_LANGUAGES,
      required: true
    }
  ],
  requiresValidation: false,
  async fetch(
    options: VideoSelectionOptions,
    config: LeaderboardAdConfig,
    callbacks: FetchCallbacks,
    signal?: AbortSignal
  ): Promise<SourceResult[]> {
    const service = new LeaderboardAdService(ADS_CACHE_DIR, config.language)
    await service.init()
    const results = await service.fetchAds(
      options,
      callbacks.onPlanReady,
      callbacks.onItemStart,
      callbacks.onItemProgress,
      signal
    )
    return results.map(r => ({ filePath: r.filePath, title: r.title }))
  }
}
