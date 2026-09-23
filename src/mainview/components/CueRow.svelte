<script lang="ts">
  import type { CueItem } from '$shared/app-state.ts'
  import { CueStatus } from '$shared/app-state.ts'
  import StatusBadge from './StatusBadge.svelte'

  interface Props {
    cue: CueItem
    index: number
  }

  let { cue, index }: Props = $props()

  const STATE_MAP: Record<CueStatus, string> = {
    [CueStatus.Pending]: 'idle',
    [CueStatus.Waiting]: 'active',
    [CueStatus.Active]: 'active',
    [CueStatus.Done]: 'done',
    [CueStatus.Error]: 'fault'
  }

  function formatDuration(ms: number | null): string {
    if (ms === null) {
      return '--'
    }
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
</script>

<div
  class="row"
  class:is-active={cue.status === CueStatus.Active}
  class:is-waiting={cue.status === CueStatus.Waiting}
  class:is-done={cue.status === CueStatus.Done}
  class:is-concurrent={cue.concurrent}
>
  <span class="index">{cue.concurrent ? '┗' : String(index + 1).padStart(2, '0')}</span>
  <span class="label">{cue.label}</span>
  <span class="dur">{formatDuration(cue.durationMs)}</span>
  <StatusBadge state={STATE_MAP[cue.status]} label={cue.status} />
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--u3);
    padding: var(--u2) var(--u3);
    border-bottom: 1px solid var(--border);
    transition: background var(--transition-fast);
  }

  .row:last-child {
    border-bottom: none;
  }

  .row.is-active {
    background: rgba(212, 147, 10, 0.07);
  }

  .row.is-waiting {
    animation: pulse-bg 2s ease-in-out infinite;
  }

  .row.is-done {
    opacity: 0.5;
  }

  .row.is-concurrent {
    padding-left: calc(var(--u3) + 10px);
  }

  .index {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
    width: 18px;
    flex-shrink: 0;
  }

  .label {
    flex: 1;
    font-size: 12px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .is-active .label,
  .is-waiting .label {
    color: var(--amber);
  }

  .dur {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  @keyframes pulse-bg {
    0%, 100% { background: rgba(212, 147, 10, 0.07); }
    50% { background: rgba(212, 147, 10, 0.15); }
  }
</style>
