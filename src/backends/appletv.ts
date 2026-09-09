import {
  discoverAppleTVs,
  pairAppleTV,
  playViaAppleTV,
  probeAppleTV,
  resolveTarget
} from '../services/player.ts'

import type { AppleTVConfig, StreamingBackend } from './types.ts'

export const appleTVBackend: StreamingBackend<AppleTVConfig> = {
  id: 'appletv',
  label: 'Apple TV (AirPlay)',

  async discover(timeoutMs = 5000) {
    const devices = await discoverAppleTVs(timeoutMs)
    return devices.map(d => ({ id: d.ip, name: d.name, detail: d.ip }))
  },

  async setup(device, onProgress) {
    onProgress?.(`Resolving ${device.name}…`)
    const target = await resolveTarget(device.name, device.id)
    onProgress?.('Pairing: enter the PINs shown on your TV')
    await pairAppleTV(target)
    return { type: 'appletv', name: target.name, id: target.id, address: target.address }
  },

  async probe(config) {
    return probeAppleTV(config)
  },

  async play(filePath, config) {
    await playViaAppleTV(filePath, config)
  }
}
