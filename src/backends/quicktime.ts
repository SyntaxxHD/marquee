import { listAirPlayDevices, playInQuickTime } from '../services/airplay.ts'

import type { QuickTimeConfig, StreamingBackend } from './types.ts'

export const quickTimeBackend: StreamingBackend<QuickTimeConfig> = {
  id: 'quicktime',
  label: 'QuickTime (macOS AirPlay)',

  async discover() {
    if (process.platform !== 'darwin') return []
    const names = await listAirPlayDevices()
    return names.map(name => ({ id: name, name, detail: 'macOS AirPlay' }))
  },

  async setup(device) {
    return { type: 'quicktime', deviceName: device.id }
  },

  async probe() {
    return process.platform === 'darwin'
  },

  async play(filePath, config) {
    await playInQuickTime(filePath, config.deviceName)
  }
}
