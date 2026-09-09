import { MarqueeError } from '../utils/errors.ts'

import { huePlugin } from './hue.ts'
import type { LightsPlugin, LightsConfig } from './types.ts'

const registry = new Map<string, LightsPlugin<LightsConfig>>()
registry.set(huePlugin.id, huePlugin)

export function listLightsPlugins() {
  return [...registry.values()].map(p => ({ id: p.id, label: p.label }))
}

export function getLightsPlugin(id: string): LightsPlugin<LightsConfig> {
  const plugin = registry.get(id)
  if (!plugin) throw new MarqueeError(`Unknown lights plugin: ${id}`)
  return plugin
}

export function getLightsPluginFor(config: LightsConfig): LightsPlugin<LightsConfig> {
  return getLightsPlugin(config.type)
}
