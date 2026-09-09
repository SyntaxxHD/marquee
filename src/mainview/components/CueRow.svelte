<script lang="ts">
  import type { CueItem } from '$shared/app-state.ts'
  import StatusBadge from './StatusBadge.svelte'

  interface Props {
    cue: CueItem
    index: number
  }

  let { cue, index }: Props = $props()

  const STATE_MAP = {
    pending: 'idle',
    active: 'active',
    done: 'done',
    error: 'fault'
  } as const

  function formatDuration(ms: number | null): string {
    if (ms === null) return '--'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
</script>

<div class="row" class:is-active={cue.status === 'active'} class:is-done={cue.status === 'done'}>
  <span class="index">{String(index + 1).padStart(2, '0')}</span>
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

  .row.is-done {
    opacity: 0.5;
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

  .is-active .label {
    color: var(--amber);
  }

  .dur {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }
</style>
