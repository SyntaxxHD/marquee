# marquee — AI instructions

Cinema pre-show assembler. Streams ads/trailers to Apple TV via AirPlay, dims Philips Hue lights.

## Code style

No semicolons. Single quotes. No trailing commas. Arrow parens omitted for single arg: `x => x`. Print width 90, 2-space indent. Always use braces for `if`/`else`/`for`/`while` — no one-liner control flow. Import ordering enforced (builtin → external → internal → parent → sibling, blank lines between groups). Use `import type` for type-only imports. No code comments unless the WHY is non-obvious.

## Pre-commit gates (all must pass)

```sh
bun run typecheck    # tsc strict
bun run lint         # eslint
bun run format:check # prettier
```

## Svelte 5

Use runes only: `$state`, `$derived`, `$effect`, `$props`, `$bindable`. Never use Svelte 4 stores (`writable`, `readable`, `derived` from `svelte/store`), `createEventDispatcher`, or `<slot>`. Use `onclick` not `on:click`. Use `{#snippet}` + `{@render}` instead of slots.

## Plugin architectures

**Streaming backends** (`src/backends/`): implement `StreamingBackend<TConfig>` from `types.ts`, add config to `StreamTargetConfig` union, register in `registry.ts`. Existing: `appletv`, `quicktime`.

**Lights plugins** (`src/lights/`): implement `LightsPlugin<TConfig>`, register in `registry.ts`. Existing: `hue`.

## Key files

- `src/shared/rpc-schema.ts` — bun↔webview RPC contract
- `src/shared/app-state.ts` — all state types
- `src/desktop/index.ts` — Electrobun main process entry
- `src/mainview/` — Svelte 5 UI

## UI aesthetic

Cinema control room — not a SaaS dashboard. No card shadows, pill buttons, or gradients.
