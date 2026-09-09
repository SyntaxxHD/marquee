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
import { INITIAL_STATE } from '../shared/app-state.ts'
import type { AppState } from '../shared/app-state.ts'
import type { MarqueeRPC } from '../shared/rpc-schema.ts'
import { MarqueeError } from '../utils/errors.ts'

const DEV_SERVER_URL = 'http://localhost:5173'

let state: AppState = structuredClone(INITIAL_STATE)
let win: BrowserWindow | null = null
let confirmResolve: (() => void) | null = null
let confirmReject: ((e: Error) => void) | null = null

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
    mutate({ screen: 'setup' })
    return
  }

  const target = userConfig.streamTarget
  let deviceLabel = 'Not configured'

  if (target?.type === 'appletv') deviceLabel = target.name
  else if (target?.type === 'quicktime') deviceLabel = target.deviceName

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
}

async function runShowSequence() {
  const userConfig = await loadUserConfig()
  if (!userConfig) throw new MarqueeError('No config. Run setup first.')
  if (!userConfig.streamTarget) throw new MarqueeError('No playback device configured.')

  const lightsConfig = userConfig.lights
  const lightsPlugin = lightsConfig ? getLightsPluginFor(lightsConfig) : null
  const lightsClient = lightsPlugin ? lightsPlugin.createClient(lightsConfig!) : null
  const lightIds = lightsConfig?.controlledLightIds ?? []
  const dimPercent = lightsConfig?.dimPercent ?? 30

  mutate({ busy: true, error: null, phase: 'lights-on', cues: [] })

  if (lightsClient) {
    appendLog('Lights → bright')
    await lightsClient.setNormal(lightIds)
  }

  mutate({ phase: 'building' })
  appendLog('Building pre-show…')

  const { outputPath, cues } = await runBuild()
  mutate({
    cues: cues.map((c, i) => ({
      id: String(i),
      label: c.label,
      durationMs: c.durationMs ?? null,
      status: 'pending'
    }))
  })

  if (state.cueMode === 'manual') {
    mutate({ phase: 'ready' })
    appendLog('Pre-show ready. Waiting for GO…')
    await waitForConfirm()
  }

  mutate({ phase: 'lights-dimming' })

  if (lightsClient) {
    appendLog(`Lights → dim (${dimPercent}%)`)
    await lightsClient.dim(lightIds, dimPercent)
  }

  mutate({ phase: 'playing', screen: 'now-playing' })
  appendLog('Playback started')

  const backend = getBackend(userConfig.streamTarget.type)
  try {
    await backend.play(outputPath, userConfig.streamTarget as never)
  } finally {
    mutate({ phase: 'lights-off', screen: 'control-room' })

    if (lightsClient) {
      appendLog('Lights → off')
      await lightsClient.off(lightIds)
    }

    mutate({
      phase: 'done',
      busy: false,
      cues: state.cues.map(c => ({ ...c, status: 'done' }))
    })

    setTimeout(() => mutate({ phase: 'idle', cues: [] }), 3000)
  }
}

function waitForConfirm(): Promise<void> {
  return new Promise((resolve, reject) => {
    confirmResolve = resolve
    confirmReject = reject
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
        const config = await backend.setup(device, message => {
          win?.webview.rpc?.send.setupProgress({ message })
        })
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

      startShow: async () => {
        if (state.busy) return
        runShowSequence().catch(e => {
          mutate({ busy: false, error: (e as Error).message, phase: 'error' })
        })
      },

      confirmStart: async () => {
        confirmResolve?.()
        confirmResolve = null
        confirmReject = null
      },

      cancelShow: async () => {
        confirmReject?.(new MarqueeError('Cancelled'))
        confirmResolve = null
        confirmReject = null

        mutate({ busy: false, phase: 'idle', screen: 'control-room' })
      },

      streamFile: async ({ filePath }) => {
        if (state.busy) return

        const userConfig = await loadUserConfig()
        if (!userConfig?.streamTarget) return

        mutate({ busy: true, phase: 'playing', screen: 'now-playing' })

        const backend = getBackend(userConfig.streamTarget.type)

        try {
          await backend.play(filePath, userConfig.streamTarget as never)
        } finally {
          mutate({ busy: false, phase: 'idle', screen: 'control-room' })
        }
      },

      setLightLevel: async ({ lightId, level }) => {
        const userConfig = await loadUserConfig()
        if (!userConfig?.lights) return

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
  if (e.data.action === 'show') win?.show()

  if (e.data.action === 'quit') Utils.quit()
})
