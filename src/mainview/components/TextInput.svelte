<script lang="ts">
  interface Props {
    value?: string
    placeholder?: string
    hint?: string
    error?: string
    type?: 'text' | 'password'
    onchange?: (v: string) => void
  }

  let {
    value = $bindable(''),
    placeholder = '',
    hint,
    error,
    type = 'text',
    onchange
  }: Props = $props()
</script>

<div class="text-input-wrap">
  <input
    class="text-input"
    class:has-error={!!error}
    {type}
    bind:value
    {placeholder}
    oninput={() => onchange?.(value)}
  />
  {#if error}
    <span class="message message--error">{error}</span>
  {:else if hint}
    <span class="message">{hint}</span>
  {/if}
</div>

<style>
  .text-input-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--u1);
    width: 100%;
  }

  .text-input {
    width: 100%;
    padding: var(--u2) var(--u3);
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-sans);
    outline: none;
    transition: border-color var(--transition-fast);
    box-sizing: border-box;
  }

  .text-input:focus {
    border-color: var(--border-focus);
  }

  .text-input.has-error {
    border-color: #ef5350;
  }

  .text-input::placeholder {
    color: var(--text-muted);
  }

  .message {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--text-muted);
  }

  .message--error {
    color: #ef5350;
  }
</style>
