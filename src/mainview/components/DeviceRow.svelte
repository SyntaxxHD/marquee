<script lang="ts">
  import type { DeviceStatus } from '$shared/app-state.ts'
  import StatusBadge from './StatusBadge.svelte'
  import ReadoutDisplay from './ReadoutDisplay.svelte'

  interface Props {
    device: DeviceStatus
  }

  let { device }: Props = $props()

  let reachState = $derived(
    device.reachable === null ? 'idle' : device.reachable ? 'done' : 'fault'
  ) as 'idle' | 'done' | 'fault'

  let reachLabel = $derived(
    device.reachable === null ? 'unknown' : device.reachable ? 'online' : 'offline'
  )
</script>

<div class="device-row">
  <div class="device-info">
    <ReadoutDisplay label="Device" value={device.label} />
    {#if device.config?.type === 'appletv'}
      <ReadoutDisplay label="IP" value={device.config.address} mono />
    {/if}
  </div>
  <StatusBadge state={reachState} label={reachLabel} />
</div>

<style>
  .device-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--u4);
    padding: var(--u2) 0;
  }

  .device-info {
    display: flex;
    gap: var(--u6);
    flex: 1;
    min-width: 0;
  }
</style>
