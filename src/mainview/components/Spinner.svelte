<script lang="ts">
  interface Props {
    size?: number
  }

  let { size = 16 }: Props = $props()
</script>

<span class="spinner" style="--sz: {size}px" role="status" aria-label="Loading">
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="var(--border)" stroke-width="2" />
    <path d="M8 2 A6 6 0 0 1 14 8" stroke="var(--amber)" stroke-width="2" stroke-linecap="square" />
  </svg>
</span>

<style>
  .spinner {
    display: inline-block;
    width: var(--sz);
    height: var(--sz);
    animation: spin 800ms linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
