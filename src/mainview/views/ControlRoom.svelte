<script lang="ts">
  import { get } from 'svelte/store'
  import { Play, Square, Trash2, Upload, Settings, Eraser } from 'lucide-svelte'
  import { rpc } from '../rpc.ts'
  import { appState, toastMessage } from '../store.ts'
  import { ShowPhase, CueMode, AppScreen } from '$shared/app-state.ts'
  import Button from '../components/Button.svelte'
  import IconButton from '../components/IconButton.svelte'
  import SectionPanel from '../components/SectionPanel.svelte'
  import CueRow from '../components/CueRow.svelte'
  import DeviceRow from '../components/DeviceRow.svelte'
  import LightFader from '../components/LightFader.svelte'
  import ToggleSwitch from '../components/ToggleSwitch.svelte'
  import Spinner from '../components/Spinner.svelte'
  import ReadoutDisplay from '../components/ReadoutDisplay.svelte'
  import ProgressTrack from '../components/ProgressTrack.svelte'
  import logo from '../assets/logo.svg'

  let state = $derived($appState)
  let busy = $derived(state.busy)
  let cueMode = $derived(state.cueMode)
  let phase = $derived(state.phase)
  let restoredPartial = $derived(state.restoredPartial)

  let showPendingConfirm = $derived(phase === ShowPhase.Ready)

  async function handleStartShow() {
    await rpc.request.startShow()
  }

  async function handleConfirmGo() {
    await rpc.request.confirmStart()
  }

  async function handleCancelShow() {
    await rpc.request.cancelShow()
  }

  async function handleClearCues() {
    await rpc.request.clearCues()
  }

  async function handleClearCache() {
    await rpc.request.clearCache()
    toastMessage.set('Cache cleared')
    setTimeout(() => toastMessage.set(null), 3000)
  }

  async function handleStreamFile() {
    await rpc.request.streamFile({ filePath: '' })
  }

  async function handleCueModeChange(autoStart: boolean) {
    await rpc.request.saveCueMode({ mode: autoStart ? CueMode.Auto : CueMode.Manual })
  }

  async function handleLightLevel(lightId: string, level: number) {
    await rpc.request.setLightLevel({ lightId, level })
  }

  async function handleSetup() {
    await rpc.request.navigateTo({ screen: AppScreen.Setup })
  }

  let logEl: HTMLDivElement | undefined

  $effect(() => {
    state.log
    logEl?.scrollTo({ top: logEl.scrollHeight })
  })

  function phaseLabel(p: typeof phase): string {
    const labels: Record<ShowPhase, string> = {
      [ShowPhase.Idle]: 'Idle',
      [ShowPhase.LightsOn]: 'Lights On',
      [ShowPhase.Building]: 'Building Pre-show',
      [ShowPhase.Ready]: 'Ready',
      [ShowPhase.LightsDimming]: 'Dimming Lights',
      [ShowPhase.Playing]: 'Playing',
      [ShowPhase.LightsOff]: 'Lights Off',
      [ShowPhase.Done]: 'Done',
      [ShowPhase.Error]: 'Error'
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
          checked={cueMode === CueMode.Auto}
          label="Auto-start"
          onchange={handleCueModeChange}
        />
        <div class="toolbar-right">
          {#if state.cues.length > 0 && (phase === ShowPhase.Idle || phase === ShowPhase.Ready || phase === ShowPhase.Done || phase === ShowPhase.Error)}
            <IconButton icon={Trash2} label="Clear programme" onclick={handleClearCues} />
          {/if}
          <ReadoutDisplay label="Phase" value={phaseLabel(phase)} mono={false} />
        </div>
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
          <button class="go-btn" onclick={handleConfirmGo}>START</button>
        </div>
      {/if}
    </SectionPanel>
  </div>

  <div class="col col--right">
    <div class="right-top">
      <SectionPanel label="Room Lights">
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
          {#if busy && phase !== ShowPhase.Ready}
            <div class="busy-row">
              <Spinner />
              <span class="busy-label">{phaseLabel(phase)}</span>
              <Button variant="danger" onclick={handleCancelShow}>Abort</Button>
            </div>
          {:else}
            {#if restoredPartial}
              <Button variant="primary" onclick={handleStartShow}>Resume Build</Button>
            {:else}
              <Button variant="primary" disabled={!state.device.config} onclick={handleStartShow}>
                Assemble Pre-show
              </Button>
            {/if}
            <IconButton icon={Upload} label="Stream file" onclick={handleStreamFile} />
            <IconButton icon={Eraser} label="Clear cache" onclick={handleClearCache} />
            <IconButton icon={Settings} label="Change device" onclick={handleSetup} />
          {/if}
        </div>

        {#if state.error}
          <p class="error-msg">{state.error}</p>
        {/if}
      </SectionPanel>

      {#if state.buildProgress}
        <SectionPanel label="Progress">
          <div class="build-progress">
            <div class="progress-item">
              <span class="progress-label">{state.buildProgress.label}</span>
              <ProgressTrack value={state.buildProgress.itemPercent} max={100} />
            </div>
            <div class="progress-item">
              <span class="progress-label">Total: {state.buildProgress.itemIndex + 1} / {state.buildProgress.itemTotal}</span>
              <ProgressTrack value={state.buildProgress.itemIndex + state.buildProgress.itemPercent / 100} max={state.buildProgress.itemTotal} />
            </div>
          </div>
        </SectionPanel>
      {/if}
    </div>

    {#if state.log.length > 0}
      <div class="log-panel">
        <div class="log-header"><span class="log-label">LOG</span></div>
        <div class="log" bind:this={logEl}>
          {#each state.log as line}
            <div class="log-line">{line}</div>
          {/each}
        </div>
      </div>
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
    grid-template-columns: 1fr 360px;
    grid-template-rows: 1fr;
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

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--u2);
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

  .build-progress {
    display: flex;
    flex-direction: column;
    gap: var(--u3);
  }

  .progress-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .progress-label {
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(.log-panel) {
    flex: 1;
    min-height: 0;
  }

  .right-top {
    display: flex;
    flex-direction: column;
    gap: var(--u4);
    flex-shrink: 0;
  }

  .log-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-surface);
    overflow: hidden;
  }

  .log-header {
    padding: var(--u2) var(--u4);
    border-bottom: 1px solid var(--border);
    background: var(--bg-raised);
    flex-shrink: 0;
  }

  .log-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .log {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--u4);
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  .log-line {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.6;
  }
</style>
