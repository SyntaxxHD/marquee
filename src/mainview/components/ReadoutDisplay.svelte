<script lang="ts">
  interface Props {
    label: string
    value: string | number
    unit?: string
    mono?: boolean
  }

  let { label, value, unit = '', mono = true }: Props = $props()
</script>

<div class="readout">
  <span class="label">{label}</span>
  <span class="value" class:mono>{value}{unit ? ` ${unit}` : ''}</span>
</div>

<style>
  .readout {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .value {
    color: var(--text-readout);
    font-size: 13px;
  }

  .value.mono {
    font-family: var(--font-mono);
  }
</style>
