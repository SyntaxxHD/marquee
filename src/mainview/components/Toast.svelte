<script lang="ts">
  import { fly } from 'svelte/transition'

  import { toastMessage } from '../store.ts'
</script>

{#if $toastMessage}
  <div class="toast" transition:fly={{ y: 8, duration: 180 }}>
    {$toastMessage}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: var(--u5);
    right: var(--u5);
    z-index: 200;
    padding: var(--u3) var(--u4);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-left: 3px solid var(--status-run);
    border-radius: var(--radius);
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-mono);
    letter-spacing: 0.02em;
    pointer-events: none;
  }
</style>
