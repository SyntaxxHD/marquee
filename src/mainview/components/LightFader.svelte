<script lang="ts">
  interface Props {
    value?: number
    label?: string
    onchange?: (value: number) => void
  }

  let { value = $bindable(100), label, onchange }: Props = $props()

  function handleInput(e: Event) {
    value = Number((e.target as HTMLInputElement).value)
    onchange?.(value)
  }
</script>

<div class="fader">
  {#if label}
    <span class="fader-label">{label}</span>
  {/if}
  <div class="track-wrap">
    <input
      class="track"
      type="range"
      min="0"
      max="100"
      step="1"
      {value}
      oninput={handleInput}
    />
    <span class="readout">{value}%</span>
  </div>
</div>

<style>
  .fader {
    display: flex;
    flex-direction: column;
    gap: var(--u1);
  }

  .fader-label {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .track-wrap {
    display: flex;
    align-items: center;
    gap: var(--u3);
  }

  .track {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 3px;
    background: var(--bg-active);
    border-radius: 0;
    outline: none;
    cursor: pointer;
  }

  .track::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 20px;
    background: var(--text-secondary);
    border-radius: var(--radius);
    cursor: grab;
    transition: background var(--transition-fast);
  }

  .track::-webkit-slider-thumb:hover {
    background: var(--text-primary);
  }

  .track::-webkit-slider-thumb:active {
    cursor: grabbing;
    background: var(--amber);
  }

  .readout {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--text-readout);
    width: 36px;
    text-align: right;
    flex-shrink: 0;
  }
</style>
