import type { BrowserWindow } from 'electrobun/main'

import { INITIAL_STATE } from '../shared/app-state.ts'
import type { AppState, CueStatus } from '../shared/app-state.ts'

export let win: BrowserWindow | null = null
export let state: AppState = structuredClone(INITIAL_STATE)

export function setWindow(w: BrowserWindow) {
  win = w
}

export function pushState() {
  win?.webview.rpc?.send.appStateUpdate(state)
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
