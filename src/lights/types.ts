export interface LightInfo {
  id: string
  name: string
}

export interface DiscoveredBridge {
  ip: string
  label?: string
}

export interface LightsClient {
  setNormal(lightIds: string[]): Promise<void>
  dim(lightIds: string[], percent: number): Promise<void>
  off(lightIds: string[]): Promise<void>
}

export interface LightsPlugin<TConfig extends { type: string }> {
  readonly id: TConfig['type']
  readonly label: string
  discoverBridges(): Promise<DiscoveredBridge[]>
  pair(ip: string, onWaiting?: () => void): Promise<string>
  listLights(ip: string, credentials: string): Promise<LightInfo[]>
  probe(config: TConfig): Promise<boolean>
  createClient(config: TConfig): LightsClient
}

export interface HueLightsConfig {
  type: 'hue'
  bridgeIp: string
  username: string
  controlledLightIds: string[]
  dimPercent: number
}

export type LightsConfig = HueLightsConfig
