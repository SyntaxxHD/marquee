import { api as hueApi, discovery, model } from 'node-hue-api'

import { MarqueeError } from '../utils/errors.ts'
import { logger } from '../utils/logger.ts'

export interface DiscoveredBridge {
  ipaddress: string
}

export interface HueLightInfo {
  id: string
  name: string
}

export async function discoverBridges(): Promise<DiscoveredBridge[]> {
  try {
    const bridges = await discovery.nupnpSearch()
    return bridges.map(b => ({ ipaddress: b.ipaddress }))
  } catch {
    return []
  }
}

export async function createHueUser(bridgeIp: string): Promise<string> {
  const unauthenticated = await hueApi
    .createInsecureLocal(bridgeIp)
    .connect('', undefined, 5000)
  try {
    const createdUser = await unauthenticated.users.createUser('marquee', 'mac')
    return createdUser.username
  } catch (err) {
    throw new MarqueeError(
      `Failed to create Hue user. Did you press the bridge button?\n${(err as Error).message}`
    )
  }
}

export async function listHueLights(
  bridgeIp: string,
  username: string
): Promise<HueLightInfo[]> {
  const authenticated = await hueApi.createInsecureLocal(bridgeIp).connect(username)
  const lights = await authenticated.lights.getAll()
  return lights.map(l => ({
    id: String((l as model.Light).id),
    name: (l as model.Light).name ?? `Light ${(l as model.Light).id}`
  }))
}

export async function validateHueConnection(
  bridgeIp: string,
  username: string
): Promise<boolean> {
  try {
    await hueApi.createInsecureLocal(bridgeIp).connect(username)
    return true
  } catch {
    return false
  }
}

export class HueClient {
  constructor(
    private bridgeIp: string,
    private username: string
  ) {}

  async setLightsNormal(lightIds: string[]): Promise<void> {
    await this.applyState(lightIds, new model.LightState().on().brightness(100).ct(366))
  }

  async dimLights(lightIds: string[]): Promise<void> {
    await this.applyState(lightIds, new model.LightState().on().brightness(30).ct(400))
  }

  async turnLightsOff(lightIds: string[]): Promise<void> {
    await this.applyState(lightIds, new model.LightState().off())
  }

  private async applyState(lightIds: string[], state: model.LightState): Promise<void> {
    try {
      const bridge = await hueApi
        .createInsecureLocal(this.bridgeIp)
        .connect(this.username)
      await Promise.all(
        lightIds.map(id =>
          bridge.lights.setLightState(id, state).catch((err: Error) => {
            logger.warn(`Hue light ${id} failed: ${err.message}`)
          })
        )
      )
    } catch (err) {
      logger.warn(`Hue bridge unreachable: ${(err as Error).message}`)
    }
  }
}
