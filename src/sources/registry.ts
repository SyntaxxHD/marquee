import { MarqueeError } from '../utils/errors.ts'

import { leaderboardPlugin } from './leaderboard.ts'
import { localSourcePlugin } from './local.ts'
import { tmdbTrailersPlugin } from './tmdb-trailers.ts'
import type { AdSourceConfig, TrailerSourceConfig, VideoSourcePlugin } from './types.ts'

const AD_SOURCES = new Map<string, VideoSourcePlugin<AdSourceConfig>>([
  [localSourcePlugin.id, localSourcePlugin as VideoSourcePlugin<AdSourceConfig>],
  [leaderboardPlugin.id, leaderboardPlugin as VideoSourcePlugin<AdSourceConfig>]
])

const TRAILER_SOURCES = new Map<string, VideoSourcePlugin<TrailerSourceConfig>>([
  [localSourcePlugin.id, localSourcePlugin as VideoSourcePlugin<TrailerSourceConfig>],
  [tmdbTrailersPlugin.id, tmdbTrailersPlugin as VideoSourcePlugin<TrailerSourceConfig>]
])

export function listAdSources() {
  return [...AD_SOURCES.values()].map(p => ({
    id: p.id,
    label: p.label,
    description: p.description,
    configFields: p.configFields,
    requiresValidation: p.requiresValidation
  }))
}

export function getAdSource(id: string): VideoSourcePlugin<AdSourceConfig> {
  const plugin = AD_SOURCES.get(id)
  if (!plugin) {
    throw new MarqueeError(`Unknown ad source: "${id}"`)
  }
  return plugin
}

export function listTrailerSources() {
  return [...TRAILER_SOURCES.values()].map(p => ({
    id: p.id,
    label: p.label,
    description: p.description,
    configFields: p.configFields,
    requiresValidation: p.requiresValidation
  }))
}

export function getTrailerSource(id: string): VideoSourcePlugin<TrailerSourceConfig> {
  const plugin = TRAILER_SOURCES.get(id)
  if (!plugin) {
    throw new MarqueeError(`Unknown trailer source: "${id}"`)
  }
  return plugin
}
