<script lang="ts">
  import { Check, ChevronDown } from 'lucide-svelte'
  import { rpc, pairingProtocol } from '../rpc.ts'
  import { appState } from '../store.ts'
  import type { BackendInfo, DiscoveredDevice, LightsPluginInfo, LightInfo, DiscoveredBridge } from '$shared/rpc-schema.ts'
  import type { UserConfig, OutputResolution, OutputFps, AdSource, TrailerSource } from '../../config.ts'
  import { TMDB_LANGUAGES, ADS_LANGUAGES } from '$shared/languages.ts'
  import { AppScreen } from '$shared/app-state.ts'
  import { Section, SectionState, PlaybackStep, HueStep } from './setup-enums.ts'
  import Button from '../components/Button.svelte'
  import SectionPanel from '../components/SectionPanel.svelte'
  import TextInput from '../components/TextInput.svelte'
  import RadioCard from '../components/RadioCard.svelte'
  import DeviceIcon from '../components/DeviceIcon.svelte'
  import Spinner from '../components/Spinner.svelte'
  import StatusBadge from '../components/StatusBadge.svelte'
  import ToggleSwitch from '../components/ToggleSwitch.svelte'
  import LightFader from '../components/LightFader.svelte'

  let activeSection = $state<Section>(Section.Playback)

  let sectionStates = $state<Record<Section, SectionState>>({
    [Section.Playback]: SectionState.Active,
    [Section.Content]: SectionState.Pending,
    [Section.Output]: SectionState.Pending,
    [Section.Lights]: SectionState.Pending
  })

  function setSection(s: Section) {
    activeSection = s
  }

  function markDone(s: Section) {
    sectionStates[s] = SectionState.Done
  }

  async function finish() {
    if (activeSection === Section.Content && contentCanContinue) {
      await rpc.request.saveConfigFields({
        fields: {
          tmdbApiKey: tmdbKey,
          trailerSource,
          trailerSelectionMode,
          trailerCount,
          trailerTargetDurationMin,
          trailerMaxVideoLengthMin: trailerMaxVideoLengthMin <= 0 ? null : trailerMaxVideoLengthMin,
          trailersDir,
          adSource,
          adSelectionMode,
          adCount,
          adTargetDurationMin,
          adMaxVideoLengthMin: adMaxVideoLengthMin <= 0 ? null : adMaxVideoLengthMin,
          adsDir,
          language,
          adsLanguage
        }
      })
    } else if (activeSection === Section.Output) {
      await rpc.request.saveConfigFields({ fields: { outputResolution, outputFps } })
    } else if (activeSection === Section.Lights && hueStep === HueStep.Done) {
      await saveHue()
    }
    await rpc.request.navigateTo({ screen: AppScreen.ControlRoom })
  }

  $effect(() => { loadExisting() })

  async function loadExisting() {
    const config = await rpc.request.getFullConfig()
    if (!config) {
      return
    }

    if (config.streamTarget) {
      configuredTarget = config.streamTarget
      playbackStep = PlaybackStep.Done
      markDone(Section.Playback)
    }

    if (config.tmdbApiKey || config.trailerSource === 'local') {
      tmdbKey = config.tmdbApiKey ?? ''
      tmdbValid = config.tmdbApiKey ? true : null
      trailerSource = config.trailerSource ?? 'auto'
      trailerSelectionMode = config.trailerSelectionMode ?? 'count'
      trailerCount = config.trailerCount ?? 3
      trailerTargetDurationMin = config.trailerTargetDurationMin ?? 10
      trailerMaxVideoLengthMin = config.trailerMaxVideoLengthMin ?? 0
      trailersDir = config.trailersDir ?? ''
      adSource = config.adSource ?? 'local'
      adSelectionMode = config.adSelectionMode ?? 'count'
      adCount = config.adCount ?? 4
      adTargetDurationMin = config.adTargetDurationMin ?? 5
      adMaxVideoLengthMin = config.adMaxVideoLengthMin ?? 1
      adsDir = config.adsDir ?? ''
      language = config.language ?? 'en-US'
      adsLanguage = config.adsLanguage ?? 'en-US'
      markDone(Section.Content)
    }
    if (config.outputResolution && config.outputFps) {
      outputResolution = config.outputResolution
      outputFps = config.outputFps
      markDone(Section.Output)
    }
    if (config.lights) {
      hueBridgeIp = config.lights.bridgeIp
      hueUsername = config.lights.username
      hueLightIds = config.lights.controlledLightIds
      hueDimPercent = config.lights.dimPercent
      selectedPluginId = config.lights.type
      hueStep = HueStep.Done
      markDone(Section.Lights)
    }
  }

  // --- Section 1: Playback ---
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

  function targetLabel(t: NonNullable<UserConfig['streamTarget']>): string {
    return t.type === 'appletv' ? t.name : t.deviceName
  }

  $effect(() => {
    rpc.request.listBackends().then(b => {
      backends = b

      if (b.length > 0) {
        selectedBackendId = b[0].id
      }
    })
  })

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
      markDone(Section.Playback)
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

  function advanceToContent() {
    markDone(Section.Playback)
    setSection(Section.Content)
  }

  // --- Section 2: Content ---
  let tmdbKey = $state('')
  let tmdbValid = $state<boolean | null>(null)
  let tmdbValidating = $state(false)
  let trailerSource = $state<TrailerSource>('auto')
  let trailerSelectionMode = $state<'count' | 'duration'>('count')
  let trailerCount = $state(3)
  let trailerTargetDurationMin = $state(10)
  let trailerMaxVideoLengthMin = $state(0)
  let trailersDir = $state('')
  let adSource = $state<AdSource>('local')
  let adSelectionMode = $state<'count' | 'duration'>('count')
  let adCount = $state(4)
  let adTargetDurationMin = $state(5)
  let adMaxVideoLengthMin = $state(1)
  let adsDir = $state('')
  let language = $state('en-US')
  let adsLanguage = $state('en-US')

  async function validateTmdb() {
    tmdbValidating = true
    tmdbValid = null
    try {
      tmdbValid = await rpc.request.validateTmdbKey({ apiKey: tmdbKey })

      if (tmdbValid) {
        await rpc.request.saveConfigFields({ fields: { tmdbApiKey: tmdbKey } })
      }
    } finally {
      tmdbValidating = false
    }
  }

  let contentCanContinue = $derived(
    trailerSource === 'local' || (tmdbValid === true && tmdbKey.length > 0)
  )

  async function saveContent() {
    await rpc.request.saveConfigFields({
      fields: {
        tmdbApiKey: tmdbKey,
        trailerSource,
        trailerSelectionMode,
        trailerCount,
        trailerTargetDurationMin,
        trailerMaxVideoLengthMin: trailerMaxVideoLengthMin <= 0 ? null : trailerMaxVideoLengthMin,
        trailersDir,
        adSource,
        adSelectionMode,
        adCount,
        adTargetDurationMin,
        adMaxVideoLengthMin: adMaxVideoLengthMin <= 0 ? null : adMaxVideoLengthMin,
        adsDir,
        language,
        adsLanguage
      }
    })
    markDone(Section.Content)
    setSection(Section.Output)
  }

  // --- Section 3: Output ---
  let outputResolution = $state<OutputResolution>('1920x1080')
  let outputFps = $state<OutputFps>(25)

  async function saveOutput() {
    await rpc.request.saveConfigFields({ fields: { outputResolution, outputFps } })
    markDone(Section.Output)
    setSection(Section.Lights)
  }

  // --- Section 4: Lights ---
  let hueStep = $state<HueStep>(HueStep.Idle)
  let lightsPlugins = $state<LightsPluginInfo[]>([])
  let selectedPluginId = $state('')
  let hueBridges = $state<DiscoveredBridge[]>([])
  let hueBridgeIp = $state('')
  let hueUsername = $state('')
  let hueLights = $state<LightInfo[]>([])
  let hueLightIds = $state<string[]>([])
  let hueDimPercent = $state(30)
  let hueError = $state<string | null>(null)
  let hueLoading = $state(false)

  let selectedPlugin = $derived(lightsPlugins.find(p => p.id === selectedPluginId) ?? null)

  $effect(() => {
    rpc.request.listLightsPlugins().then(plugins => {
      lightsPlugins = plugins

      if (plugins.length === 1) {
        selectedPluginId = plugins[0].id
      }
    })
  })

  async function discoverBridges() {
    hueStep = HueStep.Discovering
    hueError = null
    try {
      hueBridges = await rpc.request.discoverLightBridges({ pluginId: selectedPluginId })

      if (hueBridges.length > 0) {
        hueBridgeIp = hueBridges[0].ip
      }

      hueStep = HueStep.BridgeSelect
    } catch (e) {
      hueError = (e as Error).message
      hueStep = HueStep.Idle
    }
  }

  async function pairBridge() {
    hueStep = HueStep.Pairing
    hueError = null
    try {
      hueUsername = await rpc.request.pairLightBridge({ pluginId: selectedPluginId, ip: hueBridgeIp })
      hueLights = await rpc.request.listLights({ pluginId: selectedPluginId, ip: hueBridgeIp, credentials: hueUsername })
      hueStep = HueStep.Lights
    } catch (e) {
      hueError = (e as Error).message
      hueStep = HueStep.PairPrompt
    }
  }

  async function loadLightsForEdit() {
    hueLoading = true
    hueError = null
    try {
      hueLights = await rpc.request.listLights({ pluginId: selectedPluginId, ip: hueBridgeIp, credentials: hueUsername })
      hueStep = HueStep.Lights
    } catch (e) {
      hueError = (e as Error).message
    } finally {
      hueLoading = false
    }
  }

  function toggleLight(id: string) {
    if (hueLightIds.includes(id)) {
      hueLightIds = hueLightIds.filter(l => l !== id)
    } else {
      hueLightIds = [...hueLightIds, id]
    }
  }

  async function saveHue() {
    await rpc.request.saveConfigFields({
      fields: {
        lights: {
          type: selectedPluginId as 'hue',
          bridgeIp: hueBridgeIp,
          username: hueUsername,
          controlledLightIds: hueLightIds,
          dimPercent: hueDimPercent
        }
      }
    })
    markDone(Section.Lights)
    hueStep = HueStep.Done
  }

  async function skipHue() {
    await rpc.request.saveConfigFields({ fields: { lights: null } })
    markDone(Section.Lights)
  }

  const SECTIONS: { id: Section; label: string }[] = [
    { id: Section.Playback, label: 'Playback Device' },
    { id: Section.Content, label: 'Content' },
    { id: Section.Output, label: 'Output' },
    { id: Section.Lights, label: 'Lights' }
  ]
</script>

<div class="setup">
  <div class="wizard-topbar">
    <button class="wizard-back" onclick={() => rpc.request.navigateTo({ screen: AppScreen.ControlRoom })}>← Back</button>
  </div>
  <div class="wizard-body">
    <nav class="sidebar">
    <div class="sidebar-steps">
      {#each SECTIONS as s, i}
        {@const state = sectionStates[s.id]}
        <button
          class="step-btn"
          class:is-active={activeSection === s.id}
          class:is-done={state === SectionState.Done}
          disabled={state === SectionState.Pending && s.id !== Section.Lights}
          onclick={() => setSection(s.id)}
        >
          <span class="step-num">
            {#if state === SectionState.Done}
              <Check size={12} />
            {:else}
              {i + 1}
            {/if}
          </span>
          <span class="step-label">{s.label}</span>
          {#if s.id === Section.Lights}
            <span class="step-opt">opt.</span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="sidebar-footer">
      <Button variant="primary" onclick={finish}>
        Finish Setup
      </Button>
    </div>
  </nav>

  <main class="content">
    {#if activeSection === Section.Playback}
      <div class="section-wrap">
        <div class="section-head">
          <h2 class="section-title">Playback Device</h2>
          <p class="section-desc">Choose how marquee streams the pre-show to your screen.</p>
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
            <Button variant="primary" onclick={advanceToContent}>Continue</Button>
          </div>
        {/if}
      </div>

    {:else if activeSection === Section.Content}
      <div class="section-wrap">
        <div class="section-head">
          <h2 class="section-title">Content</h2>
          <p class="section-desc">Configure trailer and ad sources for the pre-show.</p>
        </div>

        <SectionPanel label="Trailers">
          <div class="field-row">
            <span class="field-label">Source</span>
            <ToggleSwitch
              checked={trailerSource === 'auto'}
              offLabel="Local folder"
              label="Auto (TMDB)"
              onchange={(v) => { trailerSource = v ? 'auto' : 'local' }}
            />
          </div>

          {#if trailerSource === 'auto'}
            <div class="field-group">
              <label class="field-label-block">TMDB API Key</label>
              <div class="key-row">
                <TextInput
                  bind:value={tmdbKey}
                  placeholder="v4 read access token"
                  type="password"
                  onchange={() => { tmdbValid = null }}
                />
                <Button variant="ghost" onclick={validateTmdb} disabled={tmdbValidating || !tmdbKey}>
                  {#if tmdbValidating}<Spinner size={12} />{:else}Validate{/if}
                </Button>
              </div>
              {#if tmdbValid === true}
                <StatusBadge state="done" label="Key valid" variant="plain" />
              {:else if tmdbValid === false}
                <StatusBadge state="fault" label="Invalid key" variant="plain" />
              {/if}
            </div>

            <div class="field-group">
              <label class="field-label-block">Language</label>
              <div class="lang-select-wrap">
                <select class="lang-select" bind:value={language}>
                  {#each TMDB_LANGUAGES as lang}
                    <option value={lang.code}>{lang.label}</option>
                  {/each}
                </select>
                <span class="lang-chevron"><ChevronDown size={14} /></span>
              </div>
            </div>
          {:else}
            <div class="field-group">
              <label class="field-label-block">Trailers folder</label>
              <TextInput bind:value={trailersDir} placeholder="/path/to/trailers" hint="Absolute path to a folder of video files" />
            </div>
          {/if}

          <div class="field-row">
            <span class="field-label">Selection</span>
            <ToggleSwitch
              checked={trailerSelectionMode === 'duration'}
              offLabel="Count"
              label="Duration"
              onchange={(v) => { trailerSelectionMode = v ? 'duration' : 'count' }}
            />
          </div>

          {#if trailerSelectionMode === 'count'}
          <div class="field-row field-row--count">
            <label class="field-label-block" for="trailer-count">Count</label>
            <input id="trailer-count" class="number-input" type="number" min="1" max="20" bind:value={trailerCount} />
          </div>
          {:else}
          <div class="field-row field-row--count">
            <label class="field-label-block" for="trailer-duration">Target</label>
            <div class="duration-input-row">
              <input id="trailer-duration" class="number-input" type="number" min="1" max="120" bind:value={trailerTargetDurationMin} />
              <span class="field-label">min</span>
            </div>
          </div>
          {/if}

          <div class="field-row field-row--count">
            <label class="field-label-block" for="trailer-maxlen">Max per video</label>
            <div class="duration-input-row">
              <input id="trailer-maxlen" class="number-input" type="number" min="0" bind:value={trailerMaxVideoLengthMin} />
              <span class="field-label">{trailerMaxVideoLengthMin <= 0 ? '∞' : 'min'}</span>
            </div>
          </div>
        </SectionPanel>

        <SectionPanel label="Ads">
          <div class="field-row">
            <span class="field-label">Source</span>
            <ToggleSwitch
              checked={adSource === 'auto'}
              offLabel="Local folder"
              label="Auto"
              onchange={(v) => { adSource = v ? 'auto' : 'local' }}
            />
          </div>

          {#if adSource === 'auto'}
            <div class="field-group">
              <label class="field-label-block">Language</label>
              <div class="lang-select-wrap">
                <select class="lang-select" bind:value={adsLanguage}>
                  {#each ADS_LANGUAGES as lang}
                    <option value={lang.code}>{lang.label}</option>
                  {/each}
                </select>
                <span class="lang-chevron"><ChevronDown size={14} /></span>
              </div>
            </div>
          {:else}
            <div class="field-group">
              <label class="field-label-block">Ads folder</label>
              <TextInput bind:value={adsDir} placeholder="/path/to/ads" hint="Absolute path to a folder of video files" />
            </div>
          {/if}

          <div class="field-row">
            <span class="field-label">Selection</span>
            <ToggleSwitch
              checked={adSelectionMode === 'duration'}
              offLabel="Count"
              label="Duration"
              onchange={(v) => { adSelectionMode = v ? 'duration' : 'count' }}
            />
          </div>

          {#if adSelectionMode === 'count'}
          <div class="field-row field-row--count">
            <label class="field-label-block" for="ad-count">Count</label>
            <input id="ad-count" class="number-input" type="number" min="1" max="20" bind:value={adCount} />
          </div>
          {:else}
          <div class="field-row field-row--count">
            <label class="field-label-block" for="ad-duration">Target</label>
            <div class="duration-input-row">
              <input id="ad-duration" class="number-input" type="number" min="1" max="60" bind:value={adTargetDurationMin} />
              <span class="field-label">min</span>
            </div>
          </div>
          {/if}

          <div class="field-row field-row--count">
            <label class="field-label-block" for="ad-maxlen">Max per video</label>
            <div class="duration-input-row">
              <input id="ad-maxlen" class="number-input" type="number" min="0" bind:value={adMaxVideoLengthMin} />
              <span class="field-label">{adMaxVideoLengthMin <= 0 ? '∞' : 'min'}</span>
            </div>
          </div>
        </SectionPanel>

        <div class="step-actions">
          <Button variant="primary" disabled={!contentCanContinue} onclick={saveContent}>Continue</Button>
        </div>
      </div>

    {:else if activeSection === Section.Output}
      <div class="section-wrap">
        <div class="section-head">
          <h2 class="section-title">Output</h2>
          <p class="section-desc">Select resolution and frame rate for the assembled pre-show file.</p>
        </div>

        <SectionPanel label="Resolution">
          <div class="card-list">
            <RadioCard
              value="1920x1080"
              bind:group={outputResolution}
              label="Full HD"
              description="1920 × 1080 — 1080p"
            />
            <RadioCard
              value="3840x2160"
              bind:group={outputResolution}
              label="4K UHD"
              description="3840 × 2160 — 2160p"
            />
          </div>
        </SectionPanel>

        <SectionPanel label="Frame Rate">
          <div class="card-list">
            <RadioCard value={25} bind:group={outputFps} label="25 fps" description="PAL / European standard" />
            <RadioCard value={30} bind:group={outputFps} label="30 fps" description="NTSC / American standard" />
            <RadioCard value={60} bind:group={outputFps} label="60 fps" description="High frame rate" />
          </div>
        </SectionPanel>

        <div class="step-actions">
          <Button variant="primary" onclick={saveOutput}>Continue</Button>
        </div>
      </div>

    {:else if activeSection === Section.Lights}
      <div class="section-wrap">
        <div class="section-head">
          <div class="section-head-icon">
            <DeviceIcon type={selectedPluginId === 'hue' ? 'hue' : 'lights'} size={40} />
          </div>
          <div>
            <h2 class="section-title">{selectedPlugin?.label ?? 'Lights'}</h2>
            <p class="section-desc">Control room lights during the show.</p>
          </div>
        </div>

        {#if hueStep === HueStep.Idle || hueStep === HueStep.Discovering}
          <SectionPanel label="Bridge">
            {#if hueStep === HueStep.Discovering}
              <div class="centered">
                <Spinner size={20} />
                <span class="hint-text">Searching for Hue bridges…</span>
              </div>
            {:else}
              <p class="hint-text">Discover your Philips Hue bridge automatically, or enter the IP address manually.</p>
              {#if hueError}
                <p class="error-msg">{hueError}</p>
              {/if}
            {/if}
          </SectionPanel>
          <div class="step-actions">
            <Button variant="ghost" onclick={skipHue}>Skip</Button>
            <Button variant="primary" onclick={discoverBridges} disabled={hueStep === HueStep.Discovering}>Discover Bridge</Button>
          </div>

        {:else if hueStep === HueStep.BridgeSelect}
          <SectionPanel label="Select Bridge">
            {#if hueBridges.length > 0}
              <div class="card-list">
                {#each hueBridges as bridge}
                  <RadioCard value={bridge.ip} bind:group={hueBridgeIp} label={bridge.ip} description={bridge.label ?? 'Discovered automatically'} />
                {/each}
              </div>
            {:else}
              <p class="empty-state">No bridges found. Enter the IP address manually or try again.</p>
            {/if}
            <div class="field-group">
              <label class="field-label-block">Bridge IP address</label>
              <TextInput bind:value={hueBridgeIp} placeholder="192.168.1.x" hint="Enter manually if not listed above" />
            </div>
          </SectionPanel>
          <div class="step-actions">
            <Button variant="ghost" onclick={skipHue}>Skip</Button>
            <Button variant="ghost" onclick={discoverBridges}>Try Again</Button>
            <Button variant="primary" disabled={!hueBridgeIp} onclick={() => { hueStep = HueStep.PairPrompt }}>Connect</Button>
          </div>

        {:else if hueStep === HueStep.PairPrompt}
          <SectionPanel label="Pair Bridge">
            <p class="hint-text">Press the <strong>link button</strong> on your Hue bridge, then click Pair within 30 seconds.</p>
            {#if hueError}
              <p class="error-msg">{hueError}</p>
            {/if}
          </SectionPanel>
          <div class="step-actions">
            <Button variant="ghost" onclick={() => { hueStep = HueStep.BridgeSelect; hueError = null }}>Back</Button>
            <Button variant="ghost" onclick={skipHue}>Skip</Button>
            <Button variant="primary" onclick={pairBridge}>Pair</Button>
          </div>

        {:else if hueStep === HueStep.Pairing}
          <SectionPanel label="Pairing">
            <div class="centered">
              <Spinner size={20} />
              <span class="hint-text">Waiting for link button…</span>
            </div>
          </SectionPanel>

        {:else if hueStep === HueStep.Lights}
          <SectionPanel label="Select Lights">
            <p class="hint-text-sm">Choose which lights marquee controls during the show.</p>
            <div class="light-list">
              {#each hueLights as light (light.id)}
                <label class="light-row" class:is-selected={hueLightIds.includes(light.id)}>
                  <input
                    type="checkbox"
                    checked={hueLightIds.includes(light.id)}
                    onchange={() => toggleLight(light.id)}
                  />
                  <span class="light-name">{light.name}</span>
                </label>
              {/each}
            </div>
          </SectionPanel>

          <SectionPanel label="Dim Level">
            <LightFader
              label="During show"
              value={hueDimPercent}
              onchange={(v) => { hueDimPercent = v }}
            />
          </SectionPanel>

          <div class="step-actions">
            <Button variant="ghost" onclick={skipHue}>Skip</Button>
            <Button variant="primary" disabled={hueLightIds.length === 0} onclick={saveHue}>Save Lights</Button>
          </div>

        {:else if hueStep === HueStep.Done}
          <SectionPanel label="Hue Connected">
            <StatusBadge state="done" label={`${hueLightIds.length} light${hueLightIds.length === 1 ? '' : 's'} configured`} />
            {#if hueError}
              <p class="error-msg">{hueError}</p>
            {/if}
          </SectionPanel>
          <div class="step-actions">
            {#if hueLoading}
              <Spinner size={14} />
            {:else}
              <Button variant="ghost" onclick={loadLightsForEdit}>Edit Lights</Button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </main>
  </div>
</div>

<style>
  .setup {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-void);
    overflow: hidden;
  }

  .wizard-topbar {
    flex-shrink: 0;
    padding: var(--u2) var(--u4);
    border-bottom: 1px solid var(--border);
  }

  .wizard-back {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 12px;
    font-family: var(--font-sans);
    cursor: pointer;
    padding: 0;
    transition: color var(--transition-fast);
  }

  .wizard-back:hover {
    color: var(--text-secondary);
  }

  .wizard-body {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .sidebar {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    padding: var(--u6) 0 var(--u4);
  }

  .sidebar-steps {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--u1);
    padding: 0 var(--u3);
  }

  .step-btn {
    display: flex;
    align-items: center;
    gap: var(--u3);
    padding: var(--u2) var(--u3);
    border: none;
    border-radius: var(--radius);
    background: none;
    cursor: pointer;
    text-align: left;
    border-left: 2px solid transparent;
    transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
    color: var(--text-muted);
  }

  .step-btn:not(:disabled):hover {
    background: var(--bg-raised);
    color: var(--text-secondary);
  }

  .step-btn:disabled {
    cursor: default;
  }

  .step-btn.is-active {
    border-left-color: var(--amber);
    color: var(--amber);
    background: rgba(212, 147, 10, 0.06);
  }

  .step-btn.is-done {
    color: var(--text-secondary);
    cursor: pointer;
  }

  .step-num {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-family: var(--font-mono);
    border: 1px solid currentColor;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .step-btn.is-active .step-num {
    background: var(--amber);
    border-color: var(--amber);
    color: #080909;
  }

  .step-label {
    font-size: 12px;
    font-family: var(--font-sans);
    flex: 1;
  }

  .step-opt {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .sidebar-footer {
    padding: var(--u4) var(--u4) 0;
    border-top: 1px solid var(--border);
    padding-top: var(--u4);
  }

  .sidebar-footer :global(.btn) {
    width: 100%;
  }

  .content {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  .section-wrap {
    max-width: 560px;
    padding: var(--u8) var(--u8);
    display: flex;
    flex-direction: column;
    gap: var(--u4);
  }

  .section-head {
    display: flex;
    align-items: flex-start;
    gap: var(--u4);
    margin-bottom: var(--u2);
  }

  .section-head-icon {
    color: var(--text-secondary);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--u1);
    font-family: var(--font-sans);
  }

  .section-desc {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .card-list {
    display: flex;
    flex-direction: column;
    gap: var(--u2);
  }

  .step-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--u2);
  }

  .centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--u3);
    padding: var(--u6) 0;
  }

  .hint-text {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0 0 var(--u3);
    line-height: 1.5;
  }

  .hint-text-sm {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0 0 var(--u3);
  }

  .error-msg {
    font-size: 12px;
    font-family: var(--font-mono);
    color: #ef5350;
    margin: var(--u2) 0 0;
  }

  .empty-state {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0;
    padding: var(--u4) 0;
  }

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

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--u2);
    margin-top: var(--u3);
  }

  .field-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--u2) 0;
  }

  .field-row--count {
    margin-top: var(--u3);
  }

  .field-label {
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .field-label-block {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .key-row {
    display: flex;
    gap: var(--u2);
    align-items: flex-start;
  }

  .key-row :global(.text-input-wrap) {
    flex: 1;
  }

  .number-input {
    width: 60px;
    padding: var(--u1) var(--u2);
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-mono);
    text-align: center;
    outline: none;
  }

  .number-input:focus {
    border-color: var(--border-focus);
  }

  .duration-input-row {
    display: flex;
    align-items: center;
    gap: var(--u2);
  }

  .lang-select {
    width: 100%;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-primary);
    font-size: 12px;
    font-family: var(--font-mono);
    padding: var(--u2) var(--u8) var(--u2) var(--u3);
    appearance: none;
    outline: none;
  }

  .lang-select:focus {
    border-color: var(--amber-dim);
  }

  .lang-select-wrap {
    position: relative;
  }

  .lang-chevron {
    position: absolute;
    right: var(--u3);
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
    display: flex;
    align-items: center;
  }

  .light-list {
    display: flex;
    flex-direction: column;
    gap: var(--u1);
    margin-bottom: var(--u3);
  }

  .light-row {
    display: flex;
    align-items: center;
    gap: var(--u3);
    padding: var(--u2) var(--u3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .light-row:hover {
    background: var(--bg-raised);
  }

  .light-row.is-selected {
    border-color: var(--amber-dim);
    background: rgba(212, 147, 10, 0.06);
  }

  .light-row input {
    accent-color: var(--amber);
  }

  .light-name {
    font-size: 13px;
    color: var(--text-primary);
  }
</style>
