import type { StreamTargetConfig } from '../backends/types.ts'

export enum ShowPhase {
  Idle = 'idle',
  LightsOn = 'lights-on',
  Building = 'building',
  Ready = 'ready',
  LightsDimming = 'lights-dimming',
  Playing = 'playing',
  LightsOff = 'lights-off',
  Done = 'done',
  Error = 'error'
}

export enum CueStatus {
  Pending = 'pending',
  Active = 'active',
  Done = 'done',
  Error = 'error'
}

export enum AppScreen {
  Setup = 'setup',
  ControlRoom = 'control-room',
  NowPlaying = 'now-playing'
}

export enum CueMode {
  Auto = 'auto',
  Manual = 'manual'
}

export interface BuildProgress {
  label: string
  itemIndex: number
  itemTotal: number
  itemPercent: number
}

export interface CueItem {
  id: string
  label: string
  durationMs: number | null
  status: CueStatus
}

export interface DeviceStatus {
  config: StreamTargetConfig | null
  reachable: boolean | null
  label: string
}

export interface LightsLight {
  id: string
  name: string
  level: number
}

export interface LightsStatus {
  pluginId: string | null
  configured: boolean
  lights: LightsLight[]
}

export interface PlaybackStatus {
  elapsedMs: number
  durationMs: number | null
  cueName: string | null
}

export interface AppState {
  screen: AppScreen
  phase: ShowPhase
  cueMode: CueMode
  cues: CueItem[]
  device: DeviceStatus
  lights: LightsStatus
  playback: PlaybackStatus
  busy: boolean
  log: string[]
  buildProgress: BuildProgress | null
  error: string | null
  restoredPartial: boolean
}

export const INITIAL_STATE: AppState = {
  screen: AppScreen.ControlRoom,
  phase: ShowPhase.Idle,
  cueMode: CueMode.Manual,
  cues: [],
  device: { config: null, reachable: null, label: 'Not configured' },
  lights: { pluginId: null, configured: false, lights: [] },
  playback: { elapsedMs: 0, durationMs: null, cueName: null },
  busy: false,
  log: [],
  buildProgress: null,
  error: null,
  restoredPartial: false
}
