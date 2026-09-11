<script lang="ts">
  interface Props {
    label?: string
    class?: string
    children?: import('svelte').Snippet
  }

  let { label, class: className, children }: Props = $props()
</script>

<section class="panel {className ?? ''}">
  {#if label}
    <header class="panel-header">
      <span class="panel-label">{label}</span>
    </header>
  {/if}
  <div class="panel-body">
    {@render children?.()}
  </div>
</section>

<style>
  .panel {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-surface);
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .panel-header {
    padding: var(--u2) var(--u4);
    border-bottom: 1px solid var(--border);
    background: var(--bg-raised);
  }

  .panel-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .panel-body {
    padding: var(--u4);
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
</style>
