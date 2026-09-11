<script lang="ts">
  type State = 'idle' | 'active' | 'done' | 'fault'

  interface Props {
    state?: State
    label: string
    variant?: 'default' | 'plain'
  }

  const STATE_COLORS: Record<State, string> = {
    idle: 'var(--status-idle)',
    active: 'var(--amber)',
    done: 'var(--status-run)',
    fault: 'var(--status-fault)'
  }

  let { state = 'idle', label, variant = 'default' }: Props = $props()
</script>

<span class="badge" class:plain={variant === 'plain'} style="--dot: {STATE_COLORS[state]}">
  <span class="dot"></span>
  {label}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--u2);
    padding: 2px var(--u2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 11px;
    font-family: var(--font-mono);
    letter-spacing: 0.03em;
    color: var(--text-secondary);
    background: var(--bg-surface);
    white-space: nowrap;
  }

  .badge.plain {
    border: none;
    background: none;
    padding: 0;
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--dot);
    flex-shrink: 0;
  }
</style>
