<script lang="ts">
  import type { Component } from 'svelte'

  interface Props {
    icon: Component
    label: string
    size?: number
    disabled?: boolean
    active?: boolean
    onclick?: () => void
  }

  let { icon: Icon, label, size = 16, disabled = false, active = false, onclick }: Props = $props()
</script>

<button
  class="icon-btn"
  class:is-active={active}
  aria-label={label}
  {disabled}
  onclick={onclick}
>
  <Icon {size} />
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-secondary);
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
    flex-shrink: 0;
  }

  .icon-btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  .icon-btn:not(:disabled):hover {
    background: var(--bg-active);
    color: var(--text-primary);
  }

  .icon-btn.is-active {
    background: var(--bg-active);
    border-color: var(--amber-dim);
    color: var(--amber);
  }
</style>
