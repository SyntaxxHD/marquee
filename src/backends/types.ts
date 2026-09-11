export interface DiscoveredDevice {
  id: string
  name: string
  detail: string
}

export interface StreamingBackend<TConfig extends { type: string }> {
  readonly id: TConfig['type']
  readonly label: string
  discover(timeoutMs?: number): Promise<DiscoveredDevice[]>
  setup(
    device: DiscoveredDevice,
    onProgress?: (message: string) => void,
    onPinRequired?: (protocol: string) => Promise<string>
  ): Promise<TConfig>
  probe(config: TConfig): Promise<boolean>
  play(filePath: string, config: TConfig): Promise<void>
}

export interface AppleTVConfig {
  type: 'appletv'
  name: string
  id: string
  address: string
}

export interface QuickTimeConfig {
  type: 'quicktime'
  deviceName: string
}

export type StreamTargetConfig = AppleTVConfig | QuickTimeConfig
