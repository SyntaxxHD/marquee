import { mkdir, readdir, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'

import { getBackend } from '../backends/registry.ts'
import { runBuild } from '../commands/build.ts'
import { loadUserConfig, NORM_CACHE_DIR, OUTPUT_DIR } from '../config.ts'
import { getLightsPluginFor } from '../lights/registry.ts'
import { concatSegments } from '../services/assemble.ts'
import { probeFileDuration } from '../services/player.ts'
import { AppScreen, CueMode, CueStatus, ShowPhase } from '../shared/app-state.ts'
import { MarqueeError } from '../utils/errors.ts'
import { loadSession, saveSession } from '../utils/session.ts'

import { appendLog, mutate, state, updateCue } from './state.ts'
import { stopWakeLock } from './wake-lock.ts'

let confirmResolve: (() => void) | null = null
let confirmReject: ((e: Error) => void) | null = null
let pinResolve: ((pin: string) => void) | null = null
let restoredOutputPath: string | null = null

export function resolveConfirm(): boolean {
  if (!confirmResolve) {
    return false
  }
  confirmResolve()
  confirmResolve = null
  confirmReject = null
  return true
}

export function cancelConfirm() {
  confirmReject?.(new MarqueeError('Cancelled'))
  confirmResolve = null
  confirmReject = null
}

export function waitForPin(): Promise<string> {
  return new Promise(resolve => {
    pinResolve = resolve
  })
}

export function resolvePin(pin: string) {
  pinResolve?.(pin)
  pinResolve = null
}

export function getRestoredOutputPath() {
  return restoredOutputPath
}

export function clearRestoredOutputPath() {
  restoredOutputPath = null
}

function waitForConfirm(): Promise<void> {
  return new Promise((resolve, reject) => {
    confirmResolve = resolve
    confirmReject = reject
  })
}

export async function initFromConfig() {
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

export async function streamPrebuilt(
  outputPath: string,
  signal: AbortSignal
): Promise<void> {
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
      await Promise.race([lightsClient.off(lightIds), Bun.sleep(8000)]).catch(() => {})
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
      cues: state.cues.map(c => ({
        ...c,
        status: c.id === '__play-content__' ? CueStatus.Active : CueStatus.Done
      }))
    })

    setTimeout(() => mutate({ phase: ShowPhase.Idle }), 3000)
    stopWakeLock()
  }
}

export async function runShowSequence(signal: AbortSignal) {
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

  const { outputPath, cues } = await runBuild(signal, {
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

export async function runDevShow(signal: AbortSignal) {
  const files = await readdir(NORM_CACHE_DIR).catch(() => [])
  const mp4s = files.filter((f: string) => f.endsWith('.mp4'))
  if (mp4s.length === 0) {
    throw new MarqueeError('No cached segments found. Run a full build first.')
  }

  const withMtime = await Promise.all(
    mp4s.map(async (f: string) => {
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

  mutate({ phase: ShowPhase.LightsOn, cues: finalCues })
  await streamPrebuilt(outputPath, signal)
}
