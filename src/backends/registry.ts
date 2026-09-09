import { MarqueeError } from '../utils/errors.ts'

import { appleTVBackend } from './appletv.ts'
import { quickTimeBackend } from './quicktime.ts'
import type { StreamingBackend, StreamTargetConfig } from './types.ts'

const BACKENDS = new Map<string, StreamingBackend<StreamTargetConfig>>([
  [appleTVBackend.id, appleTVBackend as StreamingBackend<StreamTargetConfig>],
  [quickTimeBackend.id, quickTimeBackend as StreamingBackend<StreamTargetConfig>]
])

export function listBackends(): Array<{ id: string; label: string }> {
  return Array.from(BACKENDS.values()).map(b => ({ id: b.id, label: b.label }))
}

export function getBackend(id: string): StreamingBackend<StreamTargetConfig> {
  const backend = BACKENDS.get(id)
  if (!backend) throw new MarqueeError(`Unknown streaming backend: "${id}"`)
  return backend
}

export function getBackendFor<T extends StreamTargetConfig>(
  config: T
): StreamingBackend<T> {
  return getBackend(config.type) as StreamingBackend<T>
}
