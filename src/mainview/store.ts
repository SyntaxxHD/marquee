import { writable } from 'svelte/store'

import type { AppState } from '$shared/app-state.ts'
import { INITIAL_STATE } from '$shared/app-state.ts'

export const appState = writable<AppState>(INITIAL_STATE)
export const toastMessage = writable<string | null>(null)
