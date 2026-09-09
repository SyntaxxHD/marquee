<script lang="ts">
  interface Props {
    checked?: boolean
    label?: string
    onchange?: (checked: boolean) => void
  }

  let { checked = $bindable(false), label, onchange }: Props = $props()

  function toggle() {
    checked = !checked
    onchange?.(checked)
  }
</script>

<label class="toggle" class:is-on={checked}>
  <button
    class="track"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onclick={toggle}
  >
    <span class="thumb"></span>
  </button>
  {#if label}
    <span class="toggle-label">{label}</span>
  {/if}
</label>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--u2);
    cursor: pointer;
    user-select: none;
  }

  .track {
    position: relative;
    width: 36px;
    height: 18px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    padding: 0;
    transition: background var(--transition-fast), border-color var(--transition-fast);
    flex-shrink: 0;
  }

  .toggle.is-on .track {
    background: var(--status-run-dim);
    border-color: var(--status-run);
  }

  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    background: var(--text-secondary);
    border-radius: var(--radius);
    transition: left var(--transition-fast), background var(--transition-fast);
  }

  .toggle.is-on .thumb {
    left: 20px;
    background: var(--status-run);
  }

  .toggle-label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .toggle.is-on .toggle-label {
    color: var(--text-primary);
  }
</style>
