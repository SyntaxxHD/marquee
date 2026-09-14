# Lights plugins

A lights plugin teaches marquee how to dim and restore a specific kind of smart
lighting system during the pre-show. Philips Hue ships in the box. Plugins are
part of the source tree — adding one is deliberately small and self-contained.

## The contract

Every plugin implements [`LightsPlugin<TConfig>`](./types.ts):

| Member              | When it runs | Responsibility                                                                                                                             |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                | n/a          | Stable identifier. Must equal `TConfig['type']` and the registry key.                                                                      |
| `label`             | Setup        | Human name shown in the lights plugin picker.                                                                                              |
| `discoverBridges()` | Setup        | Scan the network for bridges / controllers. Return `[]` (don't throw) when none are found.                                                 |
| `pair()`            | Setup, once  | Authenticate with the bridge and return a credential string to persist. Call `onWaiting` while blocking on user action (e.g. link button). |
| `listLights()`      | Setup        | Return all controllable lights for the paired bridge as `LightInfo[]`.                                                                     |
| `probe()`           | App launch   | Cheap reachability check. Resolve `false` on failure, never reject.                                                                        |
| `createClient()`    | Show         | Return a [`LightsClient`](./types.ts) bound to the config. marquee calls `dim()` at show start and `off()` at show end.                    |

`TConfig` is whatever you need to persist for the bridge. It must carry a
`type` string literal that matches `id`; that literal is the discriminant of the
`LightsConfig` union in [`types.ts`](./types.ts).

`LightsClient` has three methods: `setNormal(lightIds)`, `dim(lightIds, percent)`, and `off(lightIds)`.

## Adding a plugin

Three steps, no changes elsewhere.

**1. Config type** — add it to the union in [`types.ts`](./types.ts):

```ts
export interface NanoleafConfig {
  type: 'nanoleaf'
  host: string
  token: string
  panelIds: string[]
  dimPercent: number
}

export type LightsConfig = HueLightsConfig | NanoleafConfig
```

**2. Implementation** — create `src/lights/nanoleaf.ts`:

```ts
import type { LightsPlugin, LightsClient, LightInfo, DiscoveredBridge } from './types.ts'
import type { NanoleafConfig } from './types.ts'

export const nanoleafPlugin: LightsPlugin<NanoleafConfig> = {
  id: 'nanoleaf',
  label: 'Nanoleaf',

  async discoverBridges(): Promise<DiscoveredBridge[]> {
    /* mDNS scan, return [{ ip, label }] */
  },

  async pair(ip: string): Promise<string> {
    /* hold link gesture, return auth token */
  },

  async listLights(ip: string, token: string): Promise<LightInfo[]> {
    /* return panel list */
  },

  async probe(config: NanoleafConfig): Promise<boolean> {
    /* return true if reachable */
  },

  createClient(config: NanoleafConfig): LightsClient {
    return {
      setNormal: async panelIds => {
        /* restore */
      },
      dim: async (panelIds, percent) => {
        /* dim to percent */
      },
      off: async panelIds => {
        /* turn off */
      }
    }
  }
}
```

**3. Register** — add one line to [`registry.ts`](./registry.ts):

```ts
registry.set(nanoleafPlugin.id, nanoleafPlugin)
```

The Setup wizard, the show sequence, and the probe logic all resolve plugins
through the registry, so nothing else needs to change.

## Reference implementation

[`hue.ts`](./hue.ts) is the canonical example: real bridge discovery, link-button
pairing with a waiting callback, a probe, and a full `LightsClient` via
`HueClient`. Keep plugins thin; put reusable protocol logic in `../services/`
and let the plugin be the adapter.
