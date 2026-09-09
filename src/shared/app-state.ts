import type { StreamTargetConfig } from '../backends/types.ts'

export type ShowPhase =
  | 'idle'
  | 'lights-on'
  | 'building'
  | 'ready'
  | 'lights-dimming'
  | 'playing'
  | 'lights-off'
  | 'done'
  | 'error'

export type CueStatus = 'pending' | 'active' | 'done' | 'error'

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
  screen: 'setup' | 'control-room' | 'now-playing'
  phase: ShowPhase
  cueMode: 'auto' | 'manual'
  cues: CueItem[]
  device: DeviceStatus
  lights: LightsStatus
  playback: PlaybackStatus
  busy: boolean
  log: string[]
  error: string | null
}

export const INITIAL_STATE: AppState = {
  screen: 'control-room',
  phase: 'idle',
  cueMode: 'auto',
  cues: [],
  device: { config: null, reachable: null, label: 'Not configured' },
  lights: { pluginId: null, configured: false, lights: [] },
  playback: { elapsedMs: 0, durationMs: null, cueName: null },
  busy: false,
  log: [],
  error: null
}
