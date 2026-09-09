# Streaming backends

A streaming backend teaches marquee how to send an assembled video to one kind
of playback target. Apple TV (AirPlay) and QuickTime (macOS AirPlay) ship in the
box. Backends are part of the source tree (they are not downloadable plugins),
but adding one is deliberately small and self-contained.

## The contract

Every backend implements [`StreamingBackend<TConfig>`](./types.ts):

| Member       | When it runs             | Responsibility                                                                                                |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `id`         | n/a                      | Stable identifier. Must equal `TConfig['type']` and the registry key.                                         |
| `label`      | Setup                    | Human name shown in the "Playback Method" picker.                                                             |
| `discover()` | Setup                    | Scan the network / OS for candidate devices. Return `[]` (don't throw) when none are found.                   |
| `setup()`    | Setup, once per device   | Pair / authenticate a chosen device and return the config to persist. Report slow steps through `onProgress`. |
| `probe()`    | App launch, pre-playback | Cheap reachability check. Resolve `false` on failure, never reject.                                           |
| `play()`     | Show / stream            | Serve and play the file. Resolve only when playback ends.                                                     |

`TConfig` is whatever you need to persist for the device. It must carry a
`type` string literal that matches `id`; that literal is the discriminant of the
`StreamTargetConfig` union.

## Adding a backend

1. **Config type:** add it to the union in [`types.ts`](./types.ts):

   ```ts
   export interface ChromecastConfig {
     type: 'chromecast'
     name: string
     address: string
   }

   export type StreamTargetConfig = AppleTVConfig | QuickTimeConfig | ChromecastConfig
   ```

2. **Implementation:** create `chromecast.ts` implementing
   `StreamingBackend<ChromecastConfig>`. To serve the local file over a
   range-capable HTTP server, reuse [`serveFile`](../services/file-server.ts)
   rather than writing your own (that is exactly why it is shared).

3. **Register:** add one line to [`registry.ts`](./registry.ts):

   ```ts
   const BACKENDS = new Map<string, StreamingBackend<StreamTargetConfig>>([
     [appleTVBackend.id, appleTVBackend as StreamingBackend<StreamTargetConfig>],
     [quickTimeBackend.id, quickTimeBackend as StreamingBackend<StreamTargetConfig>],
     [chromecastBackend.id, chromecastBackend as StreamingBackend<StreamTargetConfig>]
   ])
   ```

That is all. The UI's Playback Method picker, the setup flow, and playback in
`run`/`stream` all resolve backends through the registry, so nothing else needs
to change.

## Reference implementation

[`appletv.ts`](./appletv.ts) is the fullest example: real discovery (mDNS),
interactive pairing with progress reporting, a probe, and playback over a
shared local file server. Keep backends thin; put reusable protocol/transport
logic in `../services/` and let the backend be the adapter.
