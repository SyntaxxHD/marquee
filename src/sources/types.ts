import type { VideoSelectionOptions } from '../services/ads.ts'

export type { VideoSelectionOptions }

export interface SourceResult {
  filePath: string
  title: string
}

export interface FetchCallbacks {
  onPlanReady?(count: number): void
  onItemStart?(index: number, title: string): void
  onItemProgress?(percent: number): void
}

export enum SourceFieldType {
  Text = 'text',
  Password = 'password',
  Dir = 'dir',
  Select = 'select'
}

export enum SourceKind {
  Ad = 'ad',
  Trailer = 'trailer'
}

export interface SourceFieldSpec {
  key: string
  type: SourceFieldType
  label: string
  placeholder?: string
  hint?: string
  options?: { code: string; label: string }[]
  required?: boolean
}

export interface VideoSourcePlugin<TConfig extends { type: string }> {
  readonly id: TConfig['type']
  readonly label: string
  readonly description: string
  readonly configFields: SourceFieldSpec[]
  readonly requiresValidation: boolean
  fetch(
    options: VideoSelectionOptions,
    config: TConfig,
    callbacks: FetchCallbacks,
    signal?: AbortSignal
  ): Promise<SourceResult[]>
  validate?(config: TConfig): Promise<boolean>
}

export interface LeaderboardAdConfig {
  type: 'leaderboard'
  language: string
}

export interface TmdbTrailerConfig {
  type: 'tmdb'
  apiKey: string
  language: string
}

export interface LocalSourceConfig {
  type: 'local'
  dir: string
}

export type AdSourceConfig = LeaderboardAdConfig | LocalSourceConfig
export type TrailerSourceConfig = TmdbTrailerConfig | LocalSourceConfig
