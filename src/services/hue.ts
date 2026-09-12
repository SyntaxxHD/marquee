process.env.NODE_HUE_API_USE_INSECURE_CONNECTION = '1'

import type { model as HueModel } from 'node-hue-api'

import { MarqueeError } from '../utils/errors.ts'

const { api: hueApi, discovery, model, ApiError } = await import('node-hue-api')

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

const LINK_BUTTON_NOT_PRESSED = 101

export interface CreateUserOptions {
  timeoutMs?: number
  intervalMs?: number
  onWaiting?: () => void
}

export async function createHueUser(
  bridgeIp: string,
  opts: CreateUserOptions = {}
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  const intervalMs = opts.intervalMs ?? 2_000
  const deadline = Date.now() + timeoutMs

  const unauthenticated = await hueApi
    .createInsecureLocal(bridgeIp)
    .connect('', undefined, 5000)

  for (;;) {
    opts.onWaiting?.()
    try {
      const createdUser = await unauthenticated.users.createUser('marquee', 'mac')
      return createdUser.username
    } catch (err) {
      const hueType = err instanceof ApiError ? err.getHueErrorType() : undefined

      if (hueType !== LINK_BUTTON_NOT_PRESSED) {
        throw new MarqueeError(
          `Failed to register with Hue bridge: ${(err as Error).message}`
        )
      }

      if (Date.now() + intervalMs >= deadline) {
        throw new MarqueeError(
          'Timed out waiting for the Hue bridge button to be pressed.'
        )
      }

      await Bun.sleep(intervalMs)
    }
  }
}

export async function listHueLights(
  bridgeIp: string,
  username: string
): Promise<HueLightInfo[]> {
  const authenticated = await hueApi.createInsecureLocal(bridgeIp).connect(username)
  const lights = await authenticated.lights.getAll()
  return lights.map(l => ({
    id: String((l as HueModel.Light).id),
    name: (l as HueModel.Light).name ?? `Light ${(l as HueModel.Light).id}`
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
    await this.applyState(lightIds, new model.LightState().on().brightness(100))
  }

  async dimLights(lightIds: string[], percent: number): Promise<void> {
    await this.applyState(
      lightIds,
      new model.LightState().on().brightness(percent).transitiontime(30)
    )
  }

  async turnLightsOff(lightIds: string[]): Promise<void> {
    await this.applyState(lightIds, new model.LightState().off().transitiontime(30))
  }

  private async applyState(
    lightIds: string[],
    state: HueModel.LightState
  ): Promise<void> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Hue bridge timeout')), 5000)
    )
    try {
      const bridge = await Promise.race([
        hueApi.createInsecureLocal(this.bridgeIp).connect(this.username),
        timeout
      ])
      const lightStateTimeout = new Promise<void>(resolve => setTimeout(resolve, 6000))
      await Promise.race([
        Promise.all(
          lightIds.map(id =>
            bridge.lights.setLightState(id, state).catch((err: Error) => {
              console.warn(`Hue light ${id} failed: ${err.message}`)
            })
          )
        ),
        lightStateTimeout
      ])
    } catch (err) {
      console.warn(`Hue bridge unreachable: ${(err as Error).message}`)
    }
  }
}
