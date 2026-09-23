import { loadUserConfig } from '../../config.ts'
import {
  getLightsPlugin,
  getLightsPluginFor,
  listLightsPlugins as listLightsPluginsFn
} from '../../lights/registry.ts'
import type { MarqueeRPC } from '../../shared/rpc-schema.ts'
import {
  listAdSources,
  getAdSource,
  listTrailerSources,
  getTrailerSource
} from '../../sources/registry.ts'
import type { AdSourceConfig, TrailerSourceConfig } from '../../sources/types.ts'
import { SourceKind } from '../../sources/types.ts'
import { mutate, state, win } from '../state.ts'

type _R = MarqueeRPC['bun']['requests']
type _Subset<K extends keyof _R> = {
  [P in K]: (params: _R[P]['params']) => Promise<_R[P]['response']>
}

export const lightsHandlers = {
  setLightLevel: async ({ lightId, level }: _R['setLightLevel']['params']) => {
    const userConfig = await loadUserConfig()
    if (!userConfig?.lights) {
      return
    }

    const client = getLightsPluginFor(userConfig.lights).createClient(userConfig.lights)
    await client.dim([lightId], level)

    mutate({
      lights: {
        ...state.lights,
        lights: state.lights.lights.map(l => (l.id === lightId ? { ...l, level } : l))
      }
    })
  },

  listLightsPlugins: async () => listLightsPluginsFn(),

  discoverLightBridges: async ({ pluginId }: _R['discoverLightBridges']['params']) => {
    const plugin = getLightsPlugin(pluginId)
    return plugin.discoverBridges()
  },

  pairLightBridge: async ({ pluginId, ip }: _R['pairLightBridge']['params']) => {
    const plugin = getLightsPlugin(pluginId)
    return plugin.pair(ip, () => {
      win?.webview.rpc?.send.setupProgress({ message: 'Waiting for link button…' })
    })
  },

  listLights: async ({ pluginId, ip, credentials }: _R['listLights']['params']) => {
    const plugin = getLightsPlugin(pluginId)
    return plugin.listLights(ip, credentials)
  },

  listAdSources: async () => listAdSources(),

  listTrailerSources: async () => listTrailerSources(),

  validateSourceConfig: async ({
    kind,
    config
  }: {
    kind: SourceKind
    config: AdSourceConfig | TrailerSourceConfig
  }) => {
    const plugin =
      kind === SourceKind.Ad ? getAdSource(config.type) : getTrailerSource(config.type)
    return plugin.validate?.(config as never) ?? false
  }
} satisfies _Subset<
  | 'setLightLevel'
  | 'listLightsPlugins'
  | 'discoverLightBridges'
  | 'pairLightBridge'
  | 'listLights'
  | 'listAdSources'
  | 'listTrailerSources'
  | 'validateSourceConfig'
>
