# marquee

Cinema pre-show assembler. Builds a reel of ads and trailers, streams it to an Apple TV over AirPlay, and dims Philips Hue lights as the show begins. When it ends, the lights go off so the movie can start.

## Tech stack

| Layer         | Tech                                           |
| ------------- | ---------------------------------------------- |
| Desktop shell | Electrobun (Bun main process + native webview) |
| UI            | Svelte 5 (runes), Vite bundler                 |
| Build         | hutch (Electrobun's build runner)              |
| Media         | ffmpeg, ffprobe, yt-dlp (vendored binaries)    |
| AirPlay       | atvremote (PyInstaller binary, vendored)       |
| Lighting      | Philips Hue via node-hue-api                   |

## Dev commands

```sh
bun install
bun run download-bins                # fetch ffmpeg, ffprobe, yt-dlp into vendor/
bun run scripts/build-atvremote.ts   # build the atvremote binary
hutch run dev                        # launch with watch mode
bun x vite build                     # build Svelte UI into dist/
npx electrobun build --env=dev       # full app bundle
```

## Quality gates

Pre-commit hook and CI both run all three. All must pass before committing.

```sh
bun run typecheck    # tsc --noEmit, strict mode
bun run lint         # eslint flat config
bun run format:check # prettier --check
```

Auto-fix: `bun run lint:fix` and `bun run format`

## Code style

Enforced by eslint + prettier — never deviate:

- No semicolons
- Single quotes
- No trailing commas
- Arrow functions omit parens for single arg: `x => x`
- Print width 90, 2-space indent, LF
- Always use braces for `if`/`else`/`for`/`while` — no one-liner control flow (enforced by lint)
- Import ordering: builtin → external → internal → parent → sibling (blank line between groups, alphabetized within)
- `import type` for type-only imports (enforced by lint)
- No code comments unless the WHY is non-obvious — never explain what the code does

## Plugin architectures

Both are intentionally extensible. Adding a new backend or lights plugin requires only three steps.

### Streaming backends (`src/backends/`)

1. Create `src/backends/<name>.ts` implementing `StreamingBackend<TConfig>` from `types.ts`
2. Add `TConfig` to the `StreamTargetConfig` union in `types.ts`
3. Register it in `registry.ts`

The Setup wizard, RPC handlers, and probe logic all pick it up automatically. Existing: `appletv`, `quicktime`.

### Lights plugins (`src/lights/`)

1. Create `src/lights/<name>.ts` implementing `LightsPlugin<TConfig>` from `types.ts`
2. Register it in `registry.ts`

Existing: `hue`.

## Key files

| File                       | Purpose                                           |
| -------------------------- | ------------------------------------------------- |
| `src/shared/rpc-schema.ts` | Full bun↔webview RPC contract (`MarqueeRPC` type) |
| `src/shared/app-state.ts`  | `AppState`, `ShowPhase`, all state shapes         |
| `src/desktop/index.ts`     | Electrobun main process entry                     |
| `src/mainview/`            | Svelte 5 UI — views, components, store, rpc       |
| `electrobun.config.ts`     | Build configuration (icons, signing, copy rules)  |
| `hutch.config.ts`          | Build pipeline steps                              |

## Component reuse

Before writing any UI markup or CSS, check `src/mainview/components/` for an existing component that covers the pattern. Existing components: `SectionPanel`, `Button`, `IconButton`, `ToggleSwitch`, `Spinner`, `ReadoutDisplay`, `ProgressTrack`, `CueRow`, `DeviceRow`, `LightFader`, `TextInput`, `RadioCard`, `StatusBadge`, `ModalDialog`.

- Prefer extending a component with a new prop over duplicating its markup elsewhere
- Extract a new component when the same structure appears (or would appear) in more than one place
- Inline markup is acceptable only when a component abstraction would genuinely add no value (e.g. a one-off structural wrapper that will never recur)

## UI aesthetic

Cinema control room — not a SaaS dashboard. No card drop shadows, no pill buttons, no gradients, no generic admin-panel layouts. Think pro A/V software.

## Skills

The `/electrobun` skill is available for Electrobun API reference (BrowserWindow, BrowserView, RPC, Tray). Ignore its algo-trading framing — the marquee architecture above is the actual context.

The `/svelte-runes` skill covers Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`), snippets vs slots, and common Svelte 4→5 migration mistakes.
