import { rm } from 'fs/promises'

import { getBackend } from '../../backends/registry.ts'
import {
  loadUserConfig,
  ADS_CACHE_DIR,
  CACHE_DIR,
  NORM_CACHE_DIR,
  OUTPUT_DIR
} from '../../config.ts'
import { AppScreen, ShowPhase } from '../../shared/app-state.ts'
import type { MarqueeRPC } from '../../shared/rpc-schema.ts'
import { clearSession } from '../../utils/session.ts'
import {
  cancelConfirm,
  clearRestoredOutputPath,
  getRestoredOutputPath,
  resolveConfirm,
  runDevShow,
  runShowSequence,
  streamPrebuilt
} from '../show.ts'
import { mutate, state } from '../state.ts'
import { startWakeLock, stopWakeLock } from '../wake-lock.ts'

type _R = MarqueeRPC['bun']['requests']
type _Subset<K extends keyof _R> = {
  [P in K]: (params: _R[P]['params']) => Promise<_R[P]['response']>
}

let showAbort: AbortController | null = null

export const showControlHandlers = {
  startShow: async () => {
    if (state.busy && state.phase !== ShowPhase.Ready) {
      return
    }

    if (state.phase === ShowPhase.Ready) {
      cancelConfirm()
      mutate({ busy: false, phase: ShowPhase.Idle, restoredPartial: false })
    }

    clearRestoredOutputPath()
    mutate({ restoredPartial: false })
    await clearSession()

    showAbort = new AbortController()
    const { signal } = showAbort

    startWakeLock()
    runShowSequence(signal).catch(e => {
      stopWakeLock()
      if ((e as Error).message === 'Cancelled') {
        return
      }

      mutate({ busy: false, error: (e as Error).message, phase: ShowPhase.Error })
    })
  },

  confirmStart: async () => {
    if (resolveConfirm()) {
      return
    }

    const outputPath = getRestoredOutputPath()
    if (!outputPath) {
      return
    }
    clearRestoredOutputPath()

    showAbort = new AbortController()
    const { signal } = showAbort

    mutate({ busy: true })
    startWakeLock()
    streamPrebuilt(outputPath, signal).catch(e => {
      stopWakeLock()
      mutate({ busy: false, error: (e as Error).message, phase: ShowPhase.Error })
    })
  },

  cancelShow: async () => {
    showAbort?.abort()
    showAbort = null
    stopWakeLock()
    cancelConfirm()
    clearRestoredOutputPath()
    mutate({
      busy: false,
      phase: ShowPhase.Idle,
      screen: AppScreen.ControlRoom,
      restoredPartial: false
    })
  },

  clearCues: async () => {
    const clearable =
      state.phase === ShowPhase.Idle ||
      state.phase === ShowPhase.Ready ||
      state.phase === ShowPhase.Done ||
      state.phase === ShowPhase.Error
    if (!clearable) {
      return
    }

    if (state.phase === ShowPhase.Ready) {
      cancelConfirm()
    }

    clearRestoredOutputPath()
    await clearSession()
    mutate({ cues: [], phase: ShowPhase.Idle, error: null, restoredPartial: false })
  },

  clearCache: async () => {
    await Promise.allSettled([
      rm(CACHE_DIR, { recursive: true, force: true }),
      rm(ADS_CACHE_DIR, { recursive: true, force: true }),
      rm(NORM_CACHE_DIR, { recursive: true, force: true }),
      rm(OUTPUT_DIR, { recursive: true, force: true })
    ])
    await clearSession()
    clearRestoredOutputPath()
    mutate({ cues: [], phase: ShowPhase.Idle, error: null, restoredPartial: false })
  },

  devStart: async () => {
    if (state.busy) {
      return
    }

    showAbort = new AbortController()
    startWakeLock()
    runDevShow(showAbort.signal).catch(e => {
      stopWakeLock()
      if ((e as Error).message === 'Cancelled') {
        return
      }
      mutate({ busy: false, error: (e as Error).message, phase: ShowPhase.Error })
    })
  },

  streamFile: async ({ filePath }: _R['streamFile']['params']) => {
    if (state.busy) {
      return
    }

    const userConfig = await loadUserConfig()
    if (!userConfig?.streamTarget) {
      return
    }

    mutate({ busy: true, phase: ShowPhase.Playing, screen: AppScreen.NowPlaying })

    const backend = getBackend(userConfig.streamTarget.type)

    try {
      await backend.play(filePath, userConfig.streamTarget as never)
    } finally {
      mutate({ busy: false, phase: ShowPhase.Idle, screen: AppScreen.ControlRoom })
    }
  },

  navigateTo: async ({ screen }: _R['navigateTo']['params']) => {
    mutate({ screen })
  }
} satisfies _Subset<
  | 'startShow'
  | 'confirmStart'
  | 'cancelShow'
  | 'clearCues'
  | 'clearCache'
  | 'devStart'
  | 'streamFile'
  | 'navigateTo'
>
