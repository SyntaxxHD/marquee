import { getBackend, listBackends as listBackendsFn } from '../../backends/registry.ts'
import type { StreamTargetConfig } from '../../backends/types.ts'
import { loadUserConfig, saveUserConfig } from '../../config.ts'
import type { MarqueeRPC } from '../../shared/rpc-schema.ts'
import { initFromConfig, resolvePin, waitForPin } from '../show.ts'
import { mutate, state, win } from '../state.ts'

type _R = MarqueeRPC['bun']['requests']
type _Subset<K extends keyof _R> = {
  [P in K]: (params: _R[P]['params']) => Promise<_R[P]['response']>
}

export const setupHandlers = {
  getState: async () => state,

  listBackends: async () => listBackendsFn().map(b => ({ id: b.id, label: b.label })),

  discoverDevices: async ({ backendId }: { backendId: string }) => {
    const backend = getBackend(backendId)
    return backend.discover(8000)
  },

  setupDevice: async ({ backendId, device }: _R['setupDevice']['params']) => {
    const backend = getBackend(backendId)
    const config = await backend.setup(
      device,
      message => {
        win?.webview.rpc?.send.setupProgress({ message })
      },
      async protocol => {
        win?.webview.rpc?.send.pairingPinRequired({ protocol })
        return waitForPin()
      }
    )

    const userConfig = await loadUserConfig()

    if (userConfig) {
      userConfig.streamTarget = config as StreamTargetConfig
      await saveUserConfig(userConfig)
    }

    await initFromConfig()
    return config as StreamTargetConfig
  },

  probeDevice: async ({ config }: _R['probeDevice']['params']) => {
    const backend = getBackend(config.type)
    return backend.probe(config as never)
  },

  loadConfig: async () => {
    await initFromConfig()
    return state
  },

  saveCueMode: async ({ mode }: _R['saveCueMode']['params']) => {
    mutate({ cueMode: mode })
  },

  submitPairingPin: async ({ pin }: _R['submitPairingPin']['params']) => {
    resolvePin(pin)
  },

  getFullConfig: async () => {
    return loadUserConfig()
  },

  saveConfigFields: async ({ fields }: _R['saveConfigFields']['params']) => {
    const existing = await loadUserConfig()
    const merged = { ...(existing ?? {}), ...fields }
    await saveUserConfig(merged as Parameters<typeof saveUserConfig>[0])
  }
} satisfies _Subset<
  | 'getState'
  | 'listBackends'
  | 'discoverDevices'
  | 'setupDevice'
  | 'probeDevice'
  | 'loadConfig'
  | 'saveCueMode'
  | 'submitPairingPin'
  | 'getFullConfig'
  | 'saveConfigFields'
>
