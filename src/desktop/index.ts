import { BrowserWindow, Tray, Utils, Updater } from 'electrobun/main'
import { defineElectrobunRPC } from 'electrobun/main'

import { listBackends, getBackend } from '../backends/registry.ts'
import type { StreamTargetConfig } from '../backends/types.ts'
import { runBuild } from '../commands/build.ts'
import { loadUserConfig, saveUserConfig } from '../config.ts'
import {
  listLightsPlugins,
  getLightsPlugin,
  getLightsPluginFor
} from '../lights/registry.ts'
import { TmdbClient } from '../services/tmdb.ts'
import {
  INITIAL_STATE,
  ShowPhase,
  CueStatus,
  AppScreen,
  CueMode
} from '../shared/app-state.ts'
import type { AppState } from '../shared/app-state.ts'
import type { MarqueeRPC } from '../shared/rpc-schema.ts'
import { MarqueeError } from '../utils/errors.ts'
import { clearSession, loadSession, saveSession } from '../utils/session.ts'

const DEV_SERVER_URL = 'http://localhost:5173'

let state: AppState = structuredClone(INITIAL_STATE)
let win: BrowserWindow | null = null
let confirmResolve: (() => void) | null = null
let confirmReject: ((e: Error) => void) | null = null
let pinResolve: ((pin: string) => void) | null = null
let restoredOutputPath: string | null = null

function pushState() {
  win?.webview.rpc?.send.appStateUpdate(state)
}

function mutate(patch: Partial<AppState>) {
  state = { ...state, ...patch }
  pushState()
}

function appendLog(message: string) {
  mutate({ log: [...state.log.slice(-49), message] })
}

async function initFromConfig() {
  const userConfig = await loadUserConfig()

  if (!userConfig) {
    mutate({ screen: AppScreen.Setup })
    return
  }

  const target = userConfig.streamTarget
  let deviceLabel = 'Not configured'

  if (target?.type === 'appletv') {
    deviceLabel = target.name
  } else if (target?.type === 'quicktime') {
    deviceLabel = target.deviceName
  }

  const lightsConfig = userConfig.lights
  const lightsLights = lightsConfig
    ? lightsConfig.controlledLightIds.map(id => ({ id, name: id, level: 100 }))
    : []

  mutate({
    device: { config: target, reachable: null, label: deviceLabel },
    lights: {
      pluginId: lightsConfig?.type ?? null,
      configured: !!lightsConfig,
      lights: lightsLights
    }
  })

  if (target) {
    const backend = getBackend(target.type)
    const reachable = await backend.probe(target as never).catch(() => false)
    mutate({ device: { ...state.device, reachable } })
  }

  const session = await loadSession()
  if (session && !session.partial) {
    restoredOutputPath = session.outputPath
    mutate({ phase: ShowPhase.Ready, cues: session.cues, log: session.log })
    appendLog('Previous build restored. Press GO to stream.')
  } else if (session?.partial) {
    mutate({ cues: session.cues, log: session.log, restoredPartial: true })
    appendLog('Build was interrupted. Downloads are cached, resume will be fast.')
  }
}

async function streamPrebuilt(outputPath: string): Promise<void> {
  const userConfig = await loadUserConfig()
  if (!userConfig?.streamTarget) {
    throw new MarqueeError('No playback device configured.')
  }

  const lightsConfig = userConfig.lights
  const lightsPlugin = lightsConfig ? getLightsPluginFor(lightsConfig) : null
  const lightsClient = lightsPlugin ? lightsPlugin.createClient(lightsConfig!) : null
  const lightIds = lightsConfig?.controlledLightIds ?? []
  const dimPercent = lightsConfig?.dimPercent ?? 30

  mutate({ phase: ShowPhase.LightsDimming })

  if (lightsClient) {
    appendLog(`Lights → dim (${dimPercent}%)`)
    await lightsClient.dim(lightIds, dimPercent)
  }

  mutate({ phase: ShowPhase.Playing, screen: AppScreen.NowPlaying })
  appendLog('Playback started')

  const backend = getBackend(userConfig.streamTarget.type)
  try {
    await backend.play(outputPath, userConfig.streamTarget as never)
  } finally {
    await clearSession()
    mutate({ phase: ShowPhase.LightsOff, screen: AppScreen.ControlRoom })

    if (lightsClient) {
      appendLog('Lights → off')
      await lightsClient.off(lightIds)
    }

    mutate({
      phase: ShowPhase.Done,
      busy: false,
      cues: state.cues.map(c => ({ ...c, status: CueStatus.Done }))
    })

    setTimeout(() => mutate({ phase: ShowPhase.Idle, cues: [] }), 3000)
  }
}

async function runShowSequence() {
  const userConfig = await loadUserConfig()
  if (!userConfig) {
    throw new MarqueeError('No config. Run setup first.')
  }
  if (!userConfig.streamTarget) {
    throw new MarqueeError('No playback device configured.')
  }

  const lightsConfig = userConfig.lights
  const lightsPlugin = lightsConfig ? getLightsPluginFor(lightsConfig) : null
  const lightsClient = lightsPlugin ? lightsPlugin.createClient(lightsConfig!) : null
  const lightIds = lightsConfig?.controlledLightIds ?? []

  mutate({ busy: true, error: null, phase: ShowPhase.LightsOn, cues: [] })

  if (lightsClient) {
    appendLog('Lights → bright')
    await lightsClient.setNormal(lightIds)
  }

  mutate({ phase: ShowPhase.Building })
  appendLog('Building pre-show…')

  const { outputPath, cues } = await runBuild({
    onLog: message => appendLog(message),
    onProgress: progress => mutate({ buildProgress: progress }),
    onDownloadsComplete: async partialCues => {
      const mapped = partialCues.map((c, i) => ({
        id: String(i),
        label: c.label,
        durationMs: c.durationMs ?? null,
        status: CueStatus.Pending
      }))

      mutate({ cues: mapped })
      await saveSession({ partial: true, outputPath: '', cues: mapped, log: state.log })
    }
  })

  const mappedCues = cues.map((c, i) => ({
    id: String(i),
    label: c.label,
    durationMs: c.durationMs ?? null,
    status: CueStatus.Pending
  }))

  mutate({ buildProgress: null, cues: mappedCues })
  await saveSession({ partial: false, outputPath, cues: mappedCues, log: state.log })

  if (state.cueMode === CueMode.Manual) {
    mutate({ phase: ShowPhase.Ready })
    appendLog('Pre-show ready. Waiting for GO…')
    await waitForConfirm()
  }

  await streamPrebuilt(outputPath)
}

function waitForConfirm(): Promise<void> {
  return new Promise((resolve, reject) => {
    confirmResolve = resolve
    confirmReject = reject
  })
}

function waitForPin(): Promise<string> {
  return new Promise(resolve => {
    pinResolve = resolve
  })
}

const rpc = defineElectrobunRPC<MarqueeRPC>('bun', {
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      getState: async () => state,

      listBackends: async () => listBackends().map(b => ({ id: b.id, label: b.label })),

      discoverDevices: async ({ backendId }) => {
        const backend = getBackend(backendId)
        return backend.discover(8000)
      },

      setupDevice: async ({ backendId, device }) => {
        const backend = getBackend(backendId)
        const config = await backend.setup(
          device,
          message => {
            win?.webview.rpc?.send.setupProgress({ message })
          },
          async protocol => {
            win?.webview.rpc?.send.pairingPinRequired({ protocol })
            return waitForPin()
          }
        )

        const userConfig = await loadUserConfig()

        if (userConfig) {
          userConfig.streamTarget = config as StreamTargetConfig
          await saveUserConfig(userConfig)
        }

        await initFromConfig()
        return config as StreamTargetConfig
      },

      probeDevice: async ({ config }) => {
        const backend = getBackend(config.type)
        return backend.probe(config as never)
      },

      loadConfig: async () => {
        await initFromConfig()
        return state
      },

      saveCueMode: async ({ mode }) => {
        mutate({ cueMode: mode })
      },

      submitPairingPin: async ({ pin }) => {
        pinResolve?.(pin)
        pinResolve = null
      },

      startShow: async () => {
        if (state.busy && state.phase !== ShowPhase.Ready) {
          return
        }

        if (state.phase === ShowPhase.Ready) {
          confirmReject?.(new MarqueeError('Cancelled'))
          confirmResolve = null
          confirmReject = null
          mutate({ busy: false, phase: ShowPhase.Idle, restoredPartial: false })
        }

        restoredOutputPath = null
        mutate({ restoredPartial: false })
        await clearSession()

        runShowSequence().catch(e => {
          if ((e as Error).message === 'Cancelled') {
            return
          }

          mutate({ busy: false, error: (e as Error).message, phase: ShowPhase.Error })
        })
      },

      confirmStart: async () => {
        if (confirmResolve) {
          confirmResolve()
          confirmResolve = null
          confirmReject = null
        } else if (restoredOutputPath) {
          const outputPath = restoredOutputPath
          restoredOutputPath = null

          mutate({ busy: true })
          streamPrebuilt(outputPath).catch(e => {
            mutate({ busy: false, error: (e as Error).message, phase: ShowPhase.Error })
          })
        }
      },

      cancelShow: async () => {
        confirmReject?.(new MarqueeError('Cancelled'))
        confirmResolve = null
        confirmReject = null
        restoredOutputPath = null
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
          confirmReject?.(new MarqueeError('Cancelled'))
          confirmResolve = null
          confirmReject = null
        }

        restoredOutputPath = null
        await clearSession()
        mutate({ cues: [], phase: ShowPhase.Idle, error: null, restoredPartial: false })
      },

      streamFile: async ({ filePath }) => {
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

      setLightLevel: async ({ lightId, level }) => {
        const userConfig = await loadUserConfig()
        if (!userConfig?.lights) {
          return
        }

        const client = getLightsPluginFor(userConfig.lights).createClient(
          userConfig.lights
        )
        await client.dim([lightId], level)

        mutate({
          lights: {
            ...state.lights,
            lights: state.lights.lights.map(l => (l.id === lightId ? { ...l, level } : l))
          }
        })
      },

      navigateTo: async ({ screen }) => {
        mutate({ screen })
      },

      getFullConfig: async () => {
        return loadUserConfig()
      },

      saveConfigFields: async ({ fields }) => {
        const existing = await loadUserConfig()
        const merged = { ...(existing ?? {}), ...fields }
        await saveUserConfig(merged as Parameters<typeof saveUserConfig>[0])
      },

      validateTmdbKey: async ({ apiKey }) => {
        const client = new TmdbClient(apiKey, 'en')
        return client.validateApiKey()
      },

      listLightsPlugins: async () => listLightsPlugins(),

      discoverLightBridges: async ({ pluginId }) => {
        const plugin = getLightsPlugin(pluginId)
        return plugin.discoverBridges()
      },

      pairLightBridge: async ({ pluginId, ip }) => {
        const plugin = getLightsPlugin(pluginId)
        return plugin.pair(ip, () => {
          win?.webview.rpc?.send.setupProgress({ message: 'Waiting for link button…' })
        })
      },

      listLights: async ({ pluginId, ip, credentials }) => {
        const plugin = getLightsPlugin(pluginId)
        return plugin.listLights(ip, credentials)
      }
    }
  }
})

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel()
  if (channel === 'dev') {
    try {
      await fetch(DEV_SERVER_URL, { method: 'HEAD' })
      return DEV_SERVER_URL
    } catch {
      // Vite server not running, use bundled build.
    }
  }
  return 'views://mainview/index.html'
}

const url = await getMainViewUrl()

win = new BrowserWindow({
  title: 'marquee',
  url,
  frame: { width: 1180, height: 820, x: 160, y: 120 },
  rpc
})

win.on('dom-ready', () => {
  pushState()
  initFromConfig().catch(console.error)
})

const tray = new Tray({ title: 'Marquee' })

tray.setMenu([
  { label: 'Show Window', action: 'show' },
  { type: 'separator' },
  { label: 'Quit', action: 'quit' }
])

tray.on('tray-clicked', e => {
  if (e.data.action === 'show') {
    win?.show()
  }

  if (e.data.action === 'quit') {
    Utils.quit()
  }
})
