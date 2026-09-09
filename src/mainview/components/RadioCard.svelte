<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    value: string
    group: string
    label: string
    description?: string
    icon?: Snippet
  }

  let { value, group = $bindable(), label, description, icon }: Props = $props()

  let selected = $derived(group === value)
</script>

<label class="radio-card" class:is-selected={selected}>
  <input type="radio" {value} bind:group class="radio-input" />
  {#if icon}
    <span class="card-icon">{@render icon()}</span>
  {/if}
  <span class="card-body">
    <span class="card-label">{label}</span>
    {#if description}
      <span class="card-desc">{description}</span>
    {/if}
  </span>
</label>

<style>
  .radio-card {
    display: flex;
    align-items: flex-start;
    gap: var(--u3);
    padding: var(--u3) var(--u4);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .radio-card:hover {
    background: var(--bg-raised);
  }

  .radio-card.is-selected {
    border-color: var(--amber-dim);
    background: rgba(212, 147, 10, 0.06);
  }

  .radio-input {
    display: none;
  }

  .card-icon {
    flex-shrink: 0;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    margin-top: 1px;
  }

  .radio-card.is-selected .card-icon {
    color: var(--amber);
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .card-label {
    font-size: 13px;
    color: var(--text-primary);
    font-family: var(--font-sans);
  }

  .radio-card.is-selected .card-label {
    color: var(--amber);
  }

  .card-desc {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--text-secondary);
  }
</style>
