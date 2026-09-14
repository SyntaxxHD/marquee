# Video sources

A video source teaches marquee how to find and download (or locate locally) ad
and trailer clips for the pre-show. The YouTube Ads Leaderboard source, the TMDB
trailers source, and the local folder source ship in the box. Sources are part
of the source tree — adding one is deliberately small and self-contained.

## The contract

Every source implements [`VideoSourcePlugin<TConfig>`](./types.ts):

| Member               | When it runs | Responsibility                                                                                                                                                                                                   |
| -------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | n/a          | Stable identifier. Must equal `TConfig['type']` and the registry key.                                                                                                                                            |
| `label`              | Setup        | Human name shown in the source dropdown.                                                                                                                                                                         |
| `description`        | Setup        | One-sentence tooltip shown below the dropdown.                                                                                                                                                                   |
| `configFields`       | Setup        | Declarative list of config fields the UI renders generically. Each field has a `key`, `type`, `label`, and optional `placeholder`, `hint`, `options`, and `required`.                                            |
| `requiresValidation` | Setup        | When `true`, the Setup UI shows a Validate button; `contentCanContinue` waits for a successful `validate()` call before allowing the user to proceed.                                                            |
| `fetch()`            | Build        | Resolve `SourceResult[]` — one entry per clip. Can use any mechanism: an official API, HTTP scraping, an SDK, yt-dlp, or reading local files. Report progress via `FetchCallbacks` and honour the `AbortSignal`. |
| `validate()`         | Setup        | Optional. Called when the user clicks Validate. Resolve `false` on failure, never reject.                                                                                                                        |

`TConfig` is whatever you need to persist for the source. It must carry a
`type` string literal that matches `id`; that literal is the discriminant of the
`AdSourceConfig` / `TrailerSourceConfig` union in [`types.ts`](./types.ts).

## Adding a source

Three steps, no changes elsewhere.

**1. Config type and implementation** — create `src/sources/<name>.ts`:

```ts
import type { VideoSourcePlugin } from './types.ts'

export interface MySourceConfig {
  type: 'mysource'
  apiKey: string
}

export const mySourcePlugin: VideoSourcePlugin<MySourceConfig> = {
  id: 'mysource',
  label: 'My Source',
  description: 'Fetch clips from My Source API.',
  configFields: [{ key: 'apiKey', type: 'password', label: 'API Key', required: true }],
  requiresValidation: true,
  async fetch(options, config, callbacks, signal) {
    // download clips, return SourceResult[]
  },
  async validate(config) {
    // return true if the API key is valid
  }
}
```

**2. Config union** — add `MySourceConfig` to the appropriate union in
[`types.ts`](./types.ts):

```ts
// for an ad source:
export type AdSourceConfig = LeaderboardAdConfig | LocalSourceConfig | MySourceConfig

// for a trailer source:
export type TrailerSourceConfig = TmdbTrailerConfig | LocalSourceConfig | MySourceConfig
```

**3. Register** — add one line to the correct map in [`registry.ts`](./registry.ts):

```ts
const AD_SOURCES = new Map([
  [localSourcePlugin.id, localSourcePlugin as VideoSourcePlugin<AdSourceConfig>],
  [leaderboardPlugin.id, leaderboardPlugin as VideoSourcePlugin<AdSourceConfig>],
  [mySourcePlugin.id, mySourcePlugin as VideoSourcePlugin<AdSourceConfig>]
])
```

The Setup dropdown, config persistence, and the build command all resolve
sources through the registry, so nothing else needs to change.

## Registries

Ad and trailer sources are managed in separate maps. A source that works for
both (like `local`) is registered in both maps. A source that only makes sense
for one type is registered in just that map.

## Reference implementations

[`leaderboard.ts`](./leaderboard.ts) is the simplest auto source: it delegates
entirely to `LeaderboardAdService` in `../services/` and just maps the result
shape. That service happens to use yt-dlp internally, but that is its own
choice — the interface has no such requirement. [`tmdb-trailers.ts`](./tmdb-trailers.ts) adds optional `validate()` for
API key verification. Keep sources thin; put reusable fetch/download logic in
`../services/` and let the source be the adapter.
