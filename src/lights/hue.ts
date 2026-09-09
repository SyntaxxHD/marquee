import {
  discoverBridges,
  createHueUser,
  listHueLights,
  validateHueConnection,
  HueClient
} from '../services/hue.ts'

import type {
  LightsPlugin,
  LightsClient,
  LightInfo,
  DiscoveredBridge,
  HueLightsConfig
} from './types.ts'

export const huePlugin: LightsPlugin<HueLightsConfig> = {
  id: 'hue',
  label: 'Philips Hue',

  discoverBridges: async (): Promise<DiscoveredBridge[]> => {
    const found = await discoverBridges()
    return found.map(b => ({ ip: b.ipaddress }))
  },

  pair: (ip: string, onWaiting?: () => void): Promise<string> =>
    createHueUser(ip, { onWaiting }),

  listLights: (ip: string, credentials: string): Promise<LightInfo[]> =>
    listHueLights(ip, credentials),

  probe: async (config: HueLightsConfig): Promise<boolean> =>
    validateHueConnection(config.bridgeIp, config.username),

  createClient: (config: HueLightsConfig): LightsClient => {
    const client = new HueClient(config.bridgeIp, config.username)
    return {
      setNormal: lightIds => client.setLightsNormal(lightIds),
      dim: (lightIds, percent) => client.dimLights(lightIds, percent),
      off: lightIds => client.turnLightsOff(lightIds)
    }
  }
}
