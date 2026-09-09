<div align="center">
  <img src="src/mainview/assets/logo.svg" alt="marquee" width="480" />
  <p>Your own cinema pre-show, for your living room.</p>
</div>

---

marquee builds a reel of ads and trailers, streams it to your Apple TV over AirPlay, and dims your Philips Hue lights as the show begins. When it ends, the lights go off so your movie can start.

## Install

Download the app for your platform from the [latest release](../../releases/latest):

| Platform | File             |
| -------- | ---------------- |
| macOS    | `marquee.dmg`    |
| Linux    | `marquee.tar.gz` |
| Windows  | `marquee.zip`    |

## Getting started

1. Open the app. It opens to the **Control Room**
2. Click the settings icon in the Playback panel to run the **Setup wizard**
3. Pick a playback method, scan for your Apple TV, and enter the PIN shown on screen
4. Optionally connect your Philips Hue bridge and pick which lights to control
5. Hit **Assemble Pre-show**. marquee handles the rest

## Development

```sh
bun install
bun run download-bins                # fetch ffmpeg, ffprobe, yt-dlp into vendor/
bun run scripts/build-atvremote.ts   # build the atvremote binary
hutch run dev                        # launch the desktop app with watch mode
```

Type check and lint:

```sh
bun run typecheck
bun run lint
```

## Adding a playback backend

marquee has a `StreamingBackend` system. Contributors can add new ones in three steps:

**1.** Create `src/backends/<name>.ts` implementing `StreamingBackend<YourConfig>`:

```ts
import type { StreamingBackend } from './types.ts'

export interface MyConfig {
  type: 'mybackend'
  deviceId: string
}

export const myBackend: StreamingBackend<MyConfig> = {
  id: 'mybackend',
  label: 'My Backend',
  async discover() {
    /* return DiscoveredDevice[] */
  },
  async setup(device) {
    return { type: 'mybackend', deviceId: device.id }
  },
  async probe(config) {
    /* return true if reachable */
  },
  async play(filePath, config) {
    /* stream the file */
  }
}
```

**2.** Add `MyConfig` to the union in `src/backends/types.ts`:

```ts
export type StreamTargetConfig = AppleTVConfig | QuickTimeConfig | MyConfig
```

**3.** Register it in `src/backends/registry.ts`:

```ts
[myBackend.id, myBackend as StreamingBackend<StreamTargetConfig>],
```

The Setup wizard and all RPC handlers pick it up automatically.

If your backend needs to serve a local file over HTTP (e.g. for a receiver that pulls rather than being pushed to), reuse `serveFile` from `src/services/file-server.ts`. It handles range requests, which tvOS requires.

## Tech stack

- [Electrobun](https://electrobun.dev) (desktop shell, Bun backend + native webview)
- [Svelte 5](https://svelte.dev) (UI, runes reactivity)
- [Vite](https://vitejs.dev) (webview bundler)
- [pyatv](https://github.com/postlund/pyatv) (AirPlay via `atvremote`, PyInstaller-bundled)
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) (pre-show assembly)
- [node-hue-api](https://github.com/peter-murray/node-hue-api) (Philips Hue)
