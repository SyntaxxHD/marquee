<script lang="ts">
  import type { BackendInfo, DiscoveredDevice } from '$shared/rpc-schema.ts'
  import type { UserConfig } from '../../config.ts'
  import { rpc, pairingProtocol } from '../rpc.ts'
  import { appState } from '../store.ts'
  import Button from '../components/Button.svelte'
  import DeviceIcon from '../components/DeviceIcon.svelte'
  import RadioCard from '../components/RadioCard.svelte'
  import SectionPanel from '../components/SectionPanel.svelte'
  import Spinner from '../components/Spinner.svelte'
  import StatusBadge from '../components/StatusBadge.svelte'
  import TextInput from '../components/TextInput.svelte'
  import { PlaybackStep } from './setup-enums.ts'

  interface Props {
    config: UserConfig | null
    oncomplete: () => void
  }
  let { config, oncomplete }: Props = $props()

  let playbackStep = $state<PlaybackStep>(PlaybackStep.Method)
  let configuredTarget = $state<UserConfig['streamTarget']>(null)
  let backends = $state<BackendInfo[]>([])
  let selectedBackendId = $state('')
  let devices = $state<DiscoveredDevice[]>([])
  let selectedDeviceId = $state('')
  let selectedDevice = $derived(devices.find(d => d.id === selectedDeviceId) ?? null)
  let scanning = $state(false)
  let pairing = $state(false)
  let pairingPin = $state('')
  let playbackError = $state<string | null>(null)

  let initialized = false
  $effect(() => {
    if (!config || initialized) return
    initialized = true
    if (config.streamTarget) {
      configuredTarget = config.streamTarget
      playbackStep = PlaybackStep.Done
    }
  })

  $effect(() => {
    rpc.request.listBackends().then(b => {
      backends = b
      if (b.length > 0) {
        selectedBackendId = b[0].id
      }
    })
  })

  function targetLabel(t: NonNullable<UserConfig['streamTarget']>): string {
    return t.type === 'appletv' ? t.name : t.deviceName
  }

  async function startScan() {
    playbackStep = PlaybackStep.Scan
    scanning = true
    playbackError = null
    devices = []
    selectedDeviceId = ''
    try {
      devices = await rpc.request.discoverDevices({ backendId: selectedBackendId })
      playbackStep = PlaybackStep.Select
    } catch (e) {
      playbackError = (e as Error).message
      playbackStep = PlaybackStep.Method
    } finally {
      scanning = false
    }
  }

  async function startPairing() {
    if (!selectedDevice) {
      return
    }

    playbackStep = PlaybackStep.Pair
    pairing = true
    playbackError = null

    try {
      await rpc.request.setupDevice({ backendId: selectedBackendId, device: selectedDevice })
      playbackStep = PlaybackStep.Done
    } catch (e) {
      playbackError = (e as Error).message
      playbackStep = PlaybackStep.Select
    } finally {
      pairing = false
    }
  }

  function backPlayback() {
    playbackError = null
    pairingProtocol.set(null)
    pairingPin = ''
    if (playbackStep === PlaybackStep.Scan) {
      playbackStep = PlaybackStep.Method
    } else if (playbackStep === PlaybackStep.Select) {
      playbackStep = PlaybackStep.Method
    } else if (playbackStep === PlaybackStep.Pair) {
      playbackStep = PlaybackStep.Select
    }
  }

  async function submitPin() {
    const pin = pairingPin
    pairingPin = ''
    pairingProtocol.set(null)
    await rpc.request.submitPairingPin({ pin })
  }

  export async function save(): Promise<void> {}
</script>

<div class="section-wrap">
  <div class="section-head">
    <div>
      <h2 class="section-title">Playback Device</h2>
      <p class="section-desc">Choose how marquee streams the pre-show to your screen.</p>
    </div>
  </div>

  {#if playbackStep === PlaybackStep.Method}
    <SectionPanel label="Method">
      <div class="card-list">
        {#each backends as b (b.id)}
          <RadioCard
            value={b.id}
            bind:group={selectedBackendId}
            label={b.label}
            description={b.id === 'appletv' ? 'Stream directly to an Apple TV via AirPlay' : 'Use macOS AirPlay through QuickTime Player'}
          >
            {#snippet icon()}
              <DeviceIcon type={b.id === 'appletv' ? 'appletv' : 'quicktime'} size={20} />
            {/snippet}
          </RadioCard>
        {/each}
      </div>
      {#if playbackError}
        <p class="error-msg">{playbackError}</p>
      {/if}
    </SectionPanel>
    <div class="step-actions">
      <Button variant="primary" onclick={startScan}>Scan for Devices</Button>
    </div>

  {:else if playbackStep === PlaybackStep.Scan}
    <SectionPanel label="Scanning">
      <div class="centered">
        <Spinner size={24} />
        <span class="hint-text">Looking for devices on your network…</span>
      </div>
    </SectionPanel>

  {:else if playbackStep === PlaybackStep.Select}
    <SectionPanel label="Select Device">
      {#if devices.length === 0}
        <p class="empty-state">No devices found.</p>
      {:else}
        <div class="card-list">
          {#each devices as d (d.id)}
            <RadioCard
              value={d.id}
              bind:group={selectedDeviceId}
              label={d.name}
              description={d.detail}
            />
          {/each}
        </div>
      {/if}
      {#if playbackError}
        <p class="error-msg">{playbackError}</p>
      {/if}
    </SectionPanel>
    <div class="step-actions">
      <Button variant="ghost" onclick={backPlayback}>Back</Button>
      <Button variant="ghost" onclick={startScan}>Rescan</Button>
      <Button variant="primary" disabled={!selectedDevice} onclick={startPairing}>Pair</Button>
    </div>

  {:else if playbackStep === PlaybackStep.Pair}
    <SectionPanel label="Pairing">
      {#if $pairingProtocol}
        <p class="hint-text">
          Enter the <strong>{$pairingProtocol === 'companion' ? 'control' : 'AirPlay'}</strong> PIN shown on your Apple TV.
        </p>
        <div class="key-row">
          <TextInput bind:value={pairingPin} placeholder="0000" />
          <Button variant="primary" disabled={pairingPin.length < 4} onclick={submitPin}>Submit</Button>
        </div>
        {#if playbackError}
          <p class="error-msg">{playbackError}</p>
        {/if}
      {:else if pairing}
        <div class="pair-waiting">
          <Spinner size={14} />
          <span>Waiting for Apple TV…</span>
        </div>
      {/if}
      <div class="pair-log">
        {#each $appState.log as line}
          <div class="log-line">{line}</div>
        {/each}
      </div>
    </SectionPanel>
    {#if !pairing}
      <div class="step-actions">
        <Button variant="ghost" onclick={backPlayback}>Back</Button>
      </div>
    {/if}

  {:else if playbackStep === PlaybackStep.Done}
    <SectionPanel label="Device Ready">
      <div class="success-row">
        <StatusBadge
          state="done"
          label={configuredTarget ? targetLabel(configuredTarget) : (selectedDevice?.name ?? 'Device paired')}
        />
      </div>
    </SectionPanel>
    <div class="step-actions">
      <Button variant="ghost" onclick={() => { playbackStep = PlaybackStep.Method }}>Change Device</Button>
      <Button variant="primary" onclick={oncomplete}>Continue</Button>
    </div>
  {/if}
</div>

<style>
  .pair-log {
    display: flex;
    flex-direction: column;
    gap: var(--u1);
    min-height: 60px;
  }

  .log-line {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--text-secondary);
  }

  .pair-waiting {
    display: flex;
    align-items: center;
    gap: var(--u2);
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: var(--u2);
  }

  .success-row {
    padding: var(--u2) 0;
  }

  .key-row {
    display: flex;
    gap: var(--u2);
    align-items: flex-start;
  }

  .key-row :global(.text-input-wrap) {
    flex: 1;
  }
</style>
