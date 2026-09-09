<script lang="ts">
  type Variant = 'primary' | 'ghost' | 'danger'

  interface Props {
    variant?: Variant
    disabled?: boolean
    type?: 'button' | 'submit'
    onclick?: () => void
    children?: import('svelte').Snippet
  }

  let { variant = 'ghost', disabled = false, type = 'button', onclick, children }: Props = $props()
</script>

<button class="btn btn--{variant}" {disabled} {type} onclick={onclick}>
  {@render children?.()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--u2);
    padding: var(--u2) var(--u4);
    border: 1px solid transparent;
    border-radius: var(--radius);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
    white-space: nowrap;
    user-select: none;
  }

  .btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  .btn--primary {
    background: var(--amber);
    border-color: var(--amber);
    color: #080909;
  }

  .btn--primary:not(:disabled):hover {
    background: var(--amber-bright);
    border-color: var(--amber-bright);
  }

  .btn--primary:not(:disabled):active {
    background: var(--amber-dim);
    border-color: var(--amber-dim);
  }

  .btn--ghost {
    background: var(--bg-raised);
    border-color: var(--border);
    color: var(--text-primary);
  }

  .btn--ghost:not(:disabled):hover {
    background: var(--bg-active);
    border-color: var(--text-secondary);
  }

  .btn--ghost:not(:disabled):active {
    background: var(--bg-void);
  }

  .btn--danger {
    background: transparent;
    border-color: var(--status-fault);
    color: #ef5350;
  }

  .btn--danger:not(:disabled):hover {
    background: var(--status-fault);
    color: var(--text-primary);
  }
</style>
