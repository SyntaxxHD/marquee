import {
  discoverAppleTVs,
  pairAppleTV,
  playViaAppleTV,
  probeAppleTV,
  resolveTarget,
  resumeAppleTVPlayback
} from '../services/player.ts'
import { MarqueeError } from '../utils/errors.ts'

import type { AppleTVConfig, StreamingBackend } from './types.ts'

export const appleTVBackend: StreamingBackend<AppleTVConfig> = {
  id: 'appletv',
  label: 'Apple TV (AirPlay)',

  async discover(timeoutMs = 5000) {
    const devices = await discoverAppleTVs(timeoutMs)
    return devices.map(d => ({ id: d.ip, name: d.name, detail: d.ip }))
  },

  async setup(device, onProgress, onPinRequired) {
    onProgress?.(`Resolving ${device.name}…`)
    const target = await resolveTarget(device.name, device.id)
    await pairAppleTV(
      target,
      onPinRequired ??
        (() => {
          throw new MarqueeError('PIN callback not provided')
        })
    )
    return { type: 'appletv', name: target.name, id: target.id, address: target.address }
  },

  async probe(config) {
    return probeAppleTV(config)
  },

  async play(filePath, config, signal, durationMs, onPlaybackStart) {
    await playViaAppleTV(filePath, config, signal, durationMs, onPlaybackStart)
  },

  async resumePlayback(config) {
    await resumeAppleTVPlayback(config)
  }
}
