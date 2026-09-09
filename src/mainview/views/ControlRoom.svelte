<script lang="ts">
  import { get } from 'svelte/store'
  import { Play, Square, Upload, Settings } from 'lucide-svelte'
  import { rpc } from '../rpc.ts'
  import { appState } from '../store.ts'
  import Button from '../components/Button.svelte'
  import IconButton from '../components/IconButton.svelte'
  import SectionPanel from '../components/SectionPanel.svelte'
  import CueRow from '../components/CueRow.svelte'
  import DeviceRow from '../components/DeviceRow.svelte'
  import LightFader from '../components/LightFader.svelte'
  import ToggleSwitch from '../components/ToggleSwitch.svelte'
  import Spinner from '../components/Spinner.svelte'
  import ReadoutDisplay from '../components/ReadoutDisplay.svelte'
  import logo from '../assets/logo.svg'

  let state = $derived($appState)
  let busy = $derived(state.busy)
  let cueMode = $derived(state.cueMode)
  let phase = $derived(state.phase)

  let showPendingConfirm = $derived(phase === 'ready' && cueMode === 'manual')

  async function handleStartShow() {
    await rpc.request.startShow()
  }

  async function handleConfirmGo() {
    await rpc.request.confirmStart()
  }

  async function handleCancelShow() {
    await rpc.request.cancelShow()
  }

  async function handleStreamFile() {
    await rpc.request.streamFile({ filePath: '' })
  }

  async function handleCueModeChange(manual: boolean) {
    await rpc.request.saveCueMode({ mode: manual ? 'manual' : 'auto' })
  }

  async function handleLightLevel(lightId: string, level: number) {
    await rpc.request.setLightLevel({ lightId, level })
  }

  async function handleSetup() {
    await rpc.request.navigateTo({ screen: 'setup' })
  }

  function phaseLabel(p: typeof phase): string {
    const labels: Record<typeof phase, string> = {
      idle: 'Idle',
      'lights-on': 'Lights On',
      building: 'Building Pre-show',
      ready: 'Ready',
      'lights-dimming': 'Dimming Lights',
      playing: 'Playing',
      'lights-off': 'Lights Off',
      done: 'Done',
      error: 'Error'
    }
    return labels[p] ?? p
  }
</script>

<div class="control-room">
  <div class="brand">
    <img src={logo} alt="marquee" class="brand-logo" />
  </div>
  <div class="panels">
    <div class="col col--programme">
    <SectionPanel label="Programme">
      <div class="programme-toolbar">
        <ToggleSwitch
          checked={cueMode === 'manual'}
          label="Manual GO"
          onchange={handleCueModeChange}
        />
        <ReadoutDisplay label="Phase" value={phaseLabel(phase)} mono={false} />
      </div>

      <div class="cue-list">
        {#each state.cues as cue, i (cue.id)}
          <CueRow {cue} index={i} />
        {/each}
        {#if state.cues.length === 0}
          <p class="empty-state">No cues. Assemble a pre-show to populate.</p>
        {/if}
      </div>

      {#if showPendingConfirm}
        <div class="go-bar">
          <button class="go-btn" onclick={handleConfirmGo}>GO</button>
        </div>
      {/if}
    </SectionPanel>
  </div>

  <div class="col col--right">
    <SectionPanel label="House Lights">
      <div class="lights">
        {#each state.lights.lights as light (light.id)}
          <LightFader
            label={light.name}
            value={light.level}
            onchange={(v) => handleLightLevel(light.id, v)}
          />
        {/each}
        {#if !state.lights.configured}
          <p class="empty-state">Lights not configured.</p>
        {/if}
      </div>
    </SectionPanel>

    <SectionPanel label="Playback">
      <DeviceRow device={state.device} />

      <div class="playback-actions">
        {#if busy}
          <div class="busy-row">
            <Spinner />
            <span class="busy-label">{phaseLabel(phase)}</span>
            {#if phase !== 'idle'}
              <Button variant="danger" onclick={handleCancelShow}>Abort</Button>
            {/if}
          </div>
        {:else}
          <Button variant="primary" disabled={!state.device.config} onclick={handleStartShow}>
            Assemble Pre-show
          </Button>
          <IconButton icon={Upload} label="Stream file" onclick={handleStreamFile} />
          <IconButton icon={Settings} label="Change device" onclick={handleSetup} />
        {/if}
      </div>

      {#if state.error}
        <p class="error-msg">{state.error}</p>
      {/if}
    </SectionPanel>

    {#if state.log.length > 0}
      <SectionPanel label="Log">
        <div class="log">
          {#each state.log as line}
            <div class="log-line">{line}</div>
          {/each}
        </div>
      </SectionPanel>
    {/if}
  </div>
  </div>
</div>

<style>
  .control-room {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-void);
    overflow: hidden;
  }

  .brand {
    padding: var(--u3) var(--u4) var(--u2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .brand-logo {
    height: 50px;
    width: auto;
    opacity: 0.9;
  }

  .panels {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: var(--u4);
    flex: 1;
    min-height: 0;
    padding: var(--u4);
    overflow: hidden;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: var(--u4);
    min-height: 0;
    overflow: hidden;
  }

  .col--programme {
    min-width: 0;
  }

  .col--programme :global(.panel-body) {
    padding: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .programme-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--u2) var(--u4);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .cue-list {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  .empty-state {
    padding: var(--u4);
    color: var(--text-muted);
    font-size: 12px;
    margin: 0;
  }

  .go-bar {
    padding: var(--u3) var(--u4);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .go-btn {
    width: 100%;
    padding: var(--u3) 0;
    background: var(--amber);
    border: none;
    border-radius: var(--radius);
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #080909;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .go-btn:hover {
    background: var(--amber-bright);
  }

  .go-btn:active {
    background: var(--amber-dim);
  }

  .lights {
    display: flex;
    flex-direction: column;
    gap: var(--u3);
  }

  .playback-actions {
    display: flex;
    align-items: center;
    gap: var(--u2);
    margin-top: var(--u3);
    flex-wrap: wrap;
  }

  .busy-row {
    display: flex;
    align-items: center;
    gap: var(--u3);
    flex: 1;
  }

  .busy-label {
    font-size: 12px;
    color: var(--text-secondary);
    flex: 1;
  }

  .error-msg {
    margin: var(--u3) 0 0;
    font-size: 12px;
    color: #ef5350;
    font-family: var(--font-mono);
  }

  .log {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 120px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .log-line {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
