import { mkdir, readdir, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'

import { BrowserWindow, Tray, Utils, Updater } from 'electrobun/main'
import { defineElectrobunRPC } from 'electrobun/main'

import { listBackends, getBackend } from '../backends/registry.ts'
import type { StreamTargetConfig } from '../backends/types.ts'
import { runBuild } from '../commands/build.ts'
import {
  loadUserConfig,
  saveUserConfig,
  CACHE_DIR,
  ADS_CACHE_DIR,
  NORM_CACHE_DIR,
  OUTPUT_DIR
} from '../config.ts'
import {
  listLightsPlugins,
  getLightsPlugin,
  getLightsPluginFor
} from '../lights/registry.ts'
import { concatSegments } from '../services/assemble.ts'
import { probeFileDuration } from '../services/player.ts'
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
let showAbort: AbortController | null = null

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

function updateCue(id: string, status: CueStatus) {
  mutate({ cues: state.cues.map(c => (c.id === id ? { ...c, status } : c)) })
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

async function streamPrebuilt(outputPath: string, signal: AbortSignal): Promise<void> {
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
  updateCue('__lights-dim__', CueStatus.Active)

  if (lightsClient) {
    appendLog(`Lights → dim (${dimPercent}%)`)
    await Promise.race([lightsClient.dim(lightIds, dimPercent), Bun.sleep(8000)]).catch(
      () => {}
    )
    appendLog('Lights dim done')
  }

  if (signal.aborted) {
    appendLog('Aborting after lights dim')
    if (lightsClient) {
      mutate({ phase: ShowPhase.LightsOn })
      await Promise.race([lightsClient.setNormal(lightIds), Bun.sleep(8000)]).catch(
        () => {}
      )
    }
    mutate({ busy: false, phase: ShowPhase.Idle })
    return
  }

  mutate({ phase: ShowPhase.Playing })
  appendLog('Streaming to Apple TV…')

  const initialCues = state.cues.map(c => ({ ...c, status: CueStatus.Pending }))
  const backend = getBackend(userConfig.streamTarget.type)
  const totalDurationMs =
    (await probeFileDuration(outputPath).catch(() => null)) ?? undefined

  const videoCues = state.cues.filter(
    c =>
      c.id !== '__lights-dim__' &&
      c.id !== '__lights-off__' &&
      c.id !== '__play-content__'
  )
  const hasPerCueDurations = videoCues.every(
    c => typeof c.durationMs === 'number' && c.durationMs > 0
  )
  let segOffset = 0
  const cueTimeline =
    hasPerCueDurations && videoCues.length > 0
      ? videoCues.map(c => {
          const startMs = segOffset
          const endMs = segOffset + (c.durationMs ?? 0)
          segOffset = endMs
          return { id: c.id, label: c.label, startMs, endMs }
        })
      : totalDurationMs && videoCues.length > 0
        ? (() => {
            const perCue = totalDurationMs / videoCues.length
            return videoCues.map((c, i) => ({
              id: c.id,
              label: c.label,
              startMs: i * perCue,
              endMs: (i + 1) * perCue
            }))
          })()
        : []
  const hasTimeline = cueTimeline.length > 0

  let playbackStart = 0
  let tickTimer: ReturnType<typeof setInterval> | null = null
  const applyTick = (elapsed: number) => {
    const activeCueLabel = hasTimeline
      ? (cueTimeline.find(c => elapsed >= c.startMs && elapsed < c.endMs)?.label ?? null)
      : (videoCues[0]?.label ?? null)
    mutate({
      playback: {
        elapsedMs: elapsed,
        durationMs: totalDurationMs ?? null,
        cueName: activeCueLabel
      },
      ...(hasTimeline
        ? {
            cues: state.cues.map(c => {
              const meta = cueTimeline.find(t => t.id === c.id)
              if (!meta) {
                return c
              }
              if (elapsed >= meta.endMs) {
                return { ...c, status: CueStatus.Done }
              }
              if (elapsed >= meta.startMs) {
                return { ...c, status: CueStatus.Active }
              }
              return c
            })
          }
        : {
            cues: state.cues.map(c =>
              c.id === videoCues[0]?.id ? { ...c, status: CueStatus.Active } : c
            )
          })
    })
  }

  try {
    await backend.play(
      outputPath,
      userConfig.streamTarget as never,
      signal,
      totalDurationMs,
      () => {
        playbackStart = Date.now()
        updateCue('__lights-dim__', CueStatus.Done)
        applyTick(0)
        tickTimer = setInterval(() => applyTick(Date.now() - playbackStart), 1000)
      }
    )
  } finally {
    if (tickTimer !== null) {
      clearInterval(tickTimer)
    }
    mutate({ playback: { elapsedMs: 0, durationMs: null, cueName: null } })
    await saveSession({ partial: false, outputPath, cues: initialCues, log: [] })
    mutate({ phase: ShowPhase.LightsOff, screen: AppScreen.ControlRoom })
    updateCue('__lights-off__', CueStatus.Active)

    if (lightsClient) {
      appendLog('Lights → 0%')
      await Promise.race([lightsClient.dim(lightIds, 0), Bun.sleep(8000)]).catch(() => {})
      appendLog('Lights off done')
    }

    if (!signal.aborted) {
      updateCue('__play-content__', CueStatus.Active)
      appendLog('Resuming content')
      await backend.resumePlayback?.(userConfig.streamTarget as never)
    }

    mutate({
      phase: ShowPhase.Done,
      busy: false,
      cues: state.cues.map(c => ({ ...c, status: CueStatus.Done }))
    })

    setTimeout(() => mutate({ phase: ShowPhase.Idle, cues: [] }), 3000)
  }
}

async function runShowSequence(signal: AbortSignal) {
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
  const dimPercent = lightsConfig?.dimPercent ?? 30

  mutate({ busy: true, error: null, phase: ShowPhase.LightsOn, cues: [] })

  if (lightsClient) {
    appendLog('Lights → bright')
    await Promise.race([lightsClient.setNormal(lightIds), Bun.sleep(8000)]).catch(
      () => {}
    )
    appendLog('Lights bright done')
  }

  if (signal.aborted) {
    mutate({ busy: false, phase: ShowPhase.Idle })
    return
  }

  mutate({ phase: ShowPhase.Building })
  appendLog('Building pre-show…')

  const { outputPath, cues } = await runBuild({
    onLog: message => appendLog(message),
    onProgress: progress => mutate({ buildProgress: progress }),
    onDownloadsComplete: async partialCues => {
      const videoCues = partialCues.map((c, i) => ({
        id: String(i),
        label: c.label,
        durationMs: c.durationMs ?? null,
        status: CueStatus.Pending
      }))
      const needsResume = userConfig.streamTarget?.type === 'appletv'
      const mapped = lightsConfig
        ? [
            {
              id: '__lights-dim__',
              label: `Lights → ${dimPercent}%`,
              durationMs: null,
              status: CueStatus.Pending
            },
            ...videoCues,
            {
              id: '__lights-off__',
              label: 'Lights → 0%',
              durationMs: null,
              status: CueStatus.Pending
            },
            ...(needsResume
              ? [
                  {
                    id: '__play-content__',
                    label: 'Play content',
                    durationMs: null,
                    status: CueStatus.Pending
                  }
                ]
              : [])
          ]
        : [
            ...videoCues,
            ...(needsResume
              ? [
                  {
                    id: '__play-content__',
                    label: 'Play content',
                    durationMs: null,
                    status: CueStatus.Pending
                  }
                ]
              : [])
          ]

      mutate({ cues: mapped })
      await saveSession({ partial: true, outputPath: '', cues: mapped, log: state.log })
    }
  })

  if (signal.aborted) {
    mutate({ busy: false, phase: ShowPhase.Idle, buildProgress: null })
    return
  }

  const videoCues = cues.map((c, i) => ({
    id: String(i),
    label: c.label,
    durationMs: c.durationMs ?? null,
    status: CueStatus.Pending
  }))

  const finalCues = lightsConfig
    ? [
        {
          id: '__lights-dim__',
          label: `Lights → ${dimPercent}%`,
          durationMs: null,
          status: CueStatus.Pending
        },
        ...videoCues,
        {
          id: '__lights-off__',
          label: 'Lights → 0%',
          durationMs: null,
          status: CueStatus.Pending
        },
        ...(userConfig.streamTarget?.type === 'appletv'
          ? [
              {
                id: '__play-content__',
                label: 'Play content',
                durationMs: null,
                status: CueStatus.Pending
              }
            ]
          : [])
      ]
    : [
        ...videoCues,
        ...(userConfig.streamTarget?.type === 'appletv'
          ? [
              {
                id: '__play-content__',
                label: 'Play content',
                durationMs: null,
                status: CueStatus.Pending
              }
            ]
          : [])
      ]

  mutate({ buildProgress: null, cues: finalCues })
  await saveSession({ partial: false, outputPath, cues: finalCues, log: state.log })

  if (state.cueMode === CueMode.Manual) {
    mutate({ phase: ShowPhase.Ready })
    appendLog('Pre-show ready. Waiting for GO…')
    await waitForConfirm()
  }

  await streamPrebuilt(outputPath, signal)
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

        showAbort = new AbortController()
        const { signal } = showAbort

        runShowSequence(signal).catch(e => {
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

          showAbort = new AbortController()
          const { signal } = showAbort

          mutate({ busy: true })
          streamPrebuilt(outputPath, signal).catch(e => {
            mutate({ busy: false, error: (e as Error).message, phase: ShowPhase.Error })
          })
        }
      },

      cancelShow: async () => {
        showAbort?.abort()
        showAbort = null
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

      clearCache: async () => {
        await Promise.allSettled([
          rm(CACHE_DIR, { recursive: true, force: true }),
          rm(ADS_CACHE_DIR, { recursive: true, force: true }),
          rm(NORM_CACHE_DIR, { recursive: true, force: true }),
          rm(OUTPUT_DIR, { recursive: true, force: true })
        ])
        await clearSession()
        restoredOutputPath = null
        mutate({ cues: [], phase: ShowPhase.Idle, error: null, restoredPartial: false })
      },

      devStart: async () => {
        if (state.busy) {
          return
        }

        const files = await readdir(NORM_CACHE_DIR).catch(() => [])
        const mp4s = files.filter(f => f.endsWith('.mp4'))
        if (mp4s.length === 0) {
          mutate({ error: 'No cached segments found. Run a full build first.' })
          return
        }

        const withMtime = await Promise.all(
          mp4s.map(async f => {
            const fullPath = join(NORM_CACHE_DIR, f)
            const s = await stat(fullPath)
            return { path: fullPath, mtime: s.mtimeMs }
          })
        )
        withMtime.sort((a, b) => b.mtime - a.mtime)
        const segPaths = withMtime.map(w => w.path)

        const durations = await Promise.all(
          segPaths.map(p => probeFileDuration(p).catch(() => null))
        )

        const devTmpDir = join(tmpdir(), `marquee-dev-${Date.now()}`)
        await mkdir(devTmpDir, { recursive: true })
        await mkdir(OUTPUT_DIR, { recursive: true })
        const outputPath = join(OUTPUT_DIR, `marquee-dev-${Date.now()}.mp4`)

        mutate({ busy: true, error: null, phase: ShowPhase.Building, cues: [] })
        appendLog(`Dev: concatenating ${segPaths.length} cached segment(s)…`)
        await concatSegments(segPaths, devTmpDir, outputPath)

        const videoCues = segPaths.map((p, i) => ({
          id: String(i),
          label: basename(p, '.mp4').replace(/_[0-9a-f]+$/, ''),
          durationMs: durations[i] ?? null,
          status: CueStatus.Pending
        }))

        const userConfig = await loadUserConfig()
        const lightsConfig = userConfig?.lights
        const dimPercent = lightsConfig?.dimPercent ?? 30
        const needsResume = userConfig?.streamTarget?.type === 'appletv'
        const finalCues = lightsConfig
          ? [
              {
                id: '__lights-dim__',
                label: `Lights → ${dimPercent}%`,
                durationMs: null,
                status: CueStatus.Pending
              },
              ...videoCues,
              {
                id: '__lights-off__',
                label: 'Lights → 0%',
                durationMs: null,
                status: CueStatus.Pending
              },
              ...(needsResume
                ? [
                    {
                      id: '__play-content__',
                      label: 'Play content',
                      durationMs: null,
                      status: CueStatus.Pending
                    }
                  ]
                : [])
            ]
          : [
              ...videoCues,
              ...(needsResume
                ? [
                    {
                      id: '__play-content__',
                      label: 'Play content',
                      durationMs: null,
                      status: CueStatus.Pending
                    }
                  ]
                : [])
            ]

        showAbort = new AbortController()
        const { signal } = showAbort

        mutate({ phase: ShowPhase.LightsOn, cues: finalCues })
        streamPrebuilt(outputPath, signal).catch(e => {
          if ((e as Error).message === 'Cancelled') {
            return
          }
          mutate({ busy: false, error: (e as Error).message, phase: ShowPhase.Error })
        })
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
