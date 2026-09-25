import type { StreamTargetConfig } from '../backends/types.ts'
import type { DiscoveredDevice } from '../backends/types.ts'
import type { UserConfig } from '../config.ts'
import type { LightInfo, DiscoveredBridge } from '../lights/types.ts'
import type {
  AdSourceConfig,
  TrailerSourceConfig,
  SourceFieldSpec
} from '../sources/types.ts'
import { SourceFieldType, SourceKind } from '../sources/types.ts'

import type { AppState, ShowPhase, CueMode } from './app-state.ts'

export { SourceFieldType, SourceKind }

export type { DiscoveredDevice, LightInfo, DiscoveredBridge }
export type BackendInfo = { id: string; label: string }
export type LightsPluginInfo = { id: string; label: string }
export type SourcePluginInfo = {
  id: string
  label: string
  description: string
  configFields: SourceFieldSpec[]
  requiresValidation: boolean
}

export type MarqueeRPC = {
  bun: {
    requests: {
      getState: { params: undefined; response: AppState }
      listBackends: { params: undefined; response: BackendInfo[] }
      discoverDevices: { params: { backendId: string }; response: DiscoveredDevice[] }
      setupDevice: {
        params: { backendId: string; device: DiscoveredDevice }
        response: StreamTargetConfig
      }
      probeDevice: { params: { config: StreamTargetConfig }; response: boolean }
      loadConfig: { params: undefined; response: AppState }
      saveCueMode: { params: { mode: CueMode }; response: void }
      startShow: { params: undefined; response: void }
      confirmStart: { params: undefined; response: void }
      cancelShow: { params: undefined; response: void }
      clearCues: { params: undefined; response: void }
      clearCache: { params: undefined; response: void }
      devStart: { params: undefined; response: void }
      submitPairingPin: { params: { pin: string }; response: void }
      streamFile: { params: { filePath: string }; response: void }
      setLightLevel: { params: { lightId: string; level: number }; response: void }
      navigateTo: { params: { screen: AppState['screen'] }; response: void }
      getFullConfig: { params: undefined; response: UserConfig | null }
      saveConfigFields: { params: { fields: Partial<UserConfig> }; response: void }
      listAdSources: { params: undefined; response: SourcePluginInfo[] }
      listTrailerSources: { params: undefined; response: SourcePluginInfo[] }
      validateSourceConfig: {
        params: { kind: SourceKind; config: AdSourceConfig | TrailerSourceConfig }
        response: boolean
      }
      listLightsPlugins: { params: undefined; response: LightsPluginInfo[] }
      discoverLightBridges: { params: { pluginId: string }; response: DiscoveredBridge[] }
      pairLightBridge: { params: { pluginId: string; ip: string }; response: string }
      listLights: {
        params: { pluginId: string; ip: string; credentials: string }
        response: LightInfo[]
      }
      enableServerMode: {
        params: { port: number; bind: 'localhost' | 'network' }
        response: { url: string }
      }
      disableServerMode: { params: undefined; response: void }
      setAutostart: { params: { enabled: boolean }; response: void }
    }
    messages: {
      logMessage: { level: string; message: string }
    }
  }
  webview: {
    requests: Record<string, never>
    messages: {
      appStateUpdate: AppState
      setupProgress: { message: string }
      phaseChanged: { phase: ShowPhase }
      pairingPinRequired: { protocol: string }
    }
  }
}
