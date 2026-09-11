<script lang="ts">
  interface Props {
    open?: boolean
    title?: string
    onclose?: () => void
    children?: import('svelte').Snippet
    actions?: import('svelte').Snippet
  }

  let { open = false, title, onclose, children, actions }: Props = $props()

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose?.()
    }
  }
</script>

{#if open}
  <div class="overlay" role="dialog" aria-modal="true" aria-label={title}>
    <div class="dialog" onkeydown={handleKeydown}>
      {#if title}
        <header class="dialog-header">
          <span class="dialog-title">{title}</span>
        </header>
      {/if}
      <div class="dialog-body">
        {@render children?.()}
      </div>
      {#if actions}
        <footer class="dialog-footer">
          {@render actions()}
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 9, 9, 0.75);
    display: grid;
    place-items: center;
    z-index: 100;
  }

  .dialog {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-width: 360px;
    max-width: 520px;
    width: 100%;
  }

  .dialog-header {
    padding: var(--u3) var(--u5);
    border-bottom: 1px solid var(--border);
    background: var(--bg-raised);
  }

  .dialog-title {
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .dialog-body {
    padding: var(--u5);
    color: var(--text-primary);
    font-size: 13px;
    line-height: 1.5;
  }

  .dialog-footer {
    padding: var(--u3) var(--u5);
    border-top: 1px solid var(--border);
    display: flex;
    gap: var(--u2);
    justify-content: flex-end;
  }
</style>
