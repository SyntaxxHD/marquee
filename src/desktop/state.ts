import { INITIAL_STATE } from '../shared/app-state.ts'
import type { AppState, CueStatus, ShowPhase } from '../shared/app-state.ts'

export type StateBroadcaster = {
  appStateUpdate(payload: AppState): void
  setupProgress(payload: { message: string }): void
  phaseChanged(payload: { phase: ShowPhase }): void
  pairingPinRequired(payload: { protocol: string }): void
}

let electrobunBroadcaster: StateBroadcaster | null = null
let wsBroadcaster: StateBroadcaster | null = null

export function registerElectrobunBroadcaster(b: StateBroadcaster) {
  electrobunBroadcaster = b
}

export function registerWsBroadcaster(b: StateBroadcaster | null) {
  wsBroadcaster = b
}

export const send: StateBroadcaster = {
  appStateUpdate: p => {
    electrobunBroadcaster?.appStateUpdate(p)
    wsBroadcaster?.appStateUpdate(p)
  },
  setupProgress: p => {
    electrobunBroadcaster?.setupProgress(p)
    wsBroadcaster?.setupProgress(p)
  },
  phaseChanged: p => {
    electrobunBroadcaster?.phaseChanged(p)
    wsBroadcaster?.phaseChanged(p)
  },
  pairingPinRequired: p => {
    electrobunBroadcaster?.pairingPinRequired(p)
    wsBroadcaster?.pairingPinRequired(p)
  }
}

export let state: AppState = structuredClone(INITIAL_STATE)

export function pushState() {
  send.appStateUpdate(state)
}

export function mutate(patch: Partial<AppState>) {
  state = { ...state, ...patch }
  pushState()
}

export function appendLog(message: string) {
  mutate({ log: [...state.log.slice(-49), message] })
}

export function updateCue(id: string, status: CueStatus) {
  mutate({ cues: state.cues.map(c => (c.id === id ? { ...c, status } : c)) })
}
