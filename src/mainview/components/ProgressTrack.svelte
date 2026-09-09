<script lang="ts">
  interface Props {
    value?: number
    max?: number
    color?: string
  }

  let { value = 0, max = 100, color = 'var(--amber)' }: Props = $props()

  let pct = $derived(max > 0 ? Math.min(100, (value / max) * 100) : 0)
</script>

<div class="track" style="--fill: {color}">
  <div class="fill" style="width: {pct}%"></div>
</div>

<style>
  .track {
    width: 100%;
    height: 2px;
    background: var(--bg-active);
    border-radius: 0;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--fill);
    transition: width 250ms linear;
  }
</style>
