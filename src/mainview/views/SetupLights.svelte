<script lang="ts">
  import type { DiscoveredBridge, LightInfo, LightsPluginInfo } from '$shared/rpc-schema.ts'
  import type { UserConfig } from '../../config.ts'
  import { rpc } from '../rpc.ts'
  import Button from '../components/Button.svelte'
  import DeviceIcon from '../components/DeviceIcon.svelte'
  import LightFader from '../components/LightFader.svelte'
  import RadioCard from '../components/RadioCard.svelte'
  import SectionPanel from '../components/SectionPanel.svelte'
  import Spinner from '../components/Spinner.svelte'
  import StatusBadge from '../components/StatusBadge.svelte'
  import TextInput from '../components/TextInput.svelte'
  import { HueStep } from './setup-enums.ts'

  interface Props {
    config: UserConfig | null
    oncomplete: () => void
    onskip: () => void
  }
  let { config, oncomplete, onskip }: Props = $props()

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

  let initialized = false
  $effect(() => {
    if (!config || initialized) return
    initialized = true
    
    if (config.lights) {
      hueBridgeIp = config.lights.bridgeIp
      hueUsername = config.lights.username
      hueLightIds = config.lights.controlledLightIds
      hueDimPercent = config.lights.dimPercent
      selectedPluginId = config.lights.type
      hueStep = HueStep.Done
    }
  })

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
      hueUsername = await rpc.request.pairLightBridge({
        pluginId: selectedPluginId,
        ip: hueBridgeIp
      })

      hueLights = await rpc.request.listLights({
        pluginId: selectedPluginId,
        ip: hueBridgeIp,
        credentials: hueUsername
      })

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
      hueLights = await rpc.request.listLights({
        pluginId: selectedPluginId,
        ip: hueBridgeIp,
        credentials: hueUsername
      })

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
    hueStep = HueStep.Done
    oncomplete()
  }

  async function skipHue() {
    await rpc.request.saveConfigFields({ fields: { lights: null } })
    onskip()
  }

  export async function save(): Promise<void> {
    if (hueStep === HueStep.Done) {
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
    }
  }
</script>

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
        <p class="hint-text">
          Discover your Philips Hue bridge automatically, or enter the IP address manually.
        </p>
        {#if hueError}
          <p class="error-msg">{hueError}</p>
        {/if}
      {/if}
    </SectionPanel>
    <div class="step-actions">
      <Button variant="ghost" onclick={skipHue}>Skip</Button>
      <Button
        variant="primary"
        onclick={discoverBridges}
        disabled={hueStep === HueStep.Discovering}
      >Discover Bridge</Button>
    </div>

  {:else if hueStep === HueStep.BridgeSelect}
    <SectionPanel label="Select Bridge">
      {#if hueBridges.length > 0}
        <div class="card-list">
          {#each hueBridges as bridge}
            <RadioCard
              value={bridge.ip}
              bind:group={hueBridgeIp}
              label={bridge.ip}
              description={bridge.label ?? 'Discovered automatically'}
            />
          {/each}
        </div>
      {:else}
        <p class="empty-state">No bridges found. Enter the IP address manually or try again.</p>
      {/if}
      <div class="field-group">
        <label class="field-label-block">Bridge IP address</label>
        <TextInput
          bind:value={hueBridgeIp}
          placeholder="192.168.1.x"
          hint="Enter manually if not listed above"
        />
      </div>
    </SectionPanel>
    <div class="step-actions">
      <Button variant="ghost" onclick={skipHue}>Skip</Button>
      <Button variant="ghost" onclick={discoverBridges}>Try Again</Button>
      <Button
        variant="primary"
        disabled={!hueBridgeIp}
        onclick={() => {
          hueStep = HueStep.PairPrompt
        }}
      >Connect</Button>
    </div>

  {:else if hueStep === HueStep.PairPrompt}
    <SectionPanel label="Pair Bridge">
      <p class="hint-text">
        Press the <strong>link button</strong> on your Hue bridge, then click Pair within 30
        seconds.
      </p>
      {#if hueError}
        <p class="error-msg">{hueError}</p>
      {/if}
    </SectionPanel>
    <div class="step-actions">
      <Button
        variant="ghost"
        onclick={() => {
          hueStep = HueStep.BridgeSelect
          hueError = null
        }}
      >Back</Button>
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
        onchange={v => {
          hueDimPercent = v
        }}
      />
    </SectionPanel>

    <div class="step-actions">
      <Button variant="ghost" onclick={skipHue}>Skip</Button>
      <Button variant="primary" disabled={hueLightIds.length === 0} onclick={saveHue}>
        Save Lights
      </Button>
    </div>

  {:else if hueStep === HueStep.Done}
    <SectionPanel label="Hue Connected">
      <StatusBadge
        state="done"
        label={`${hueLightIds.length} light${hueLightIds.length === 1 ? '' : 's'} configured`}
      />
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

<style>
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--u2);
    margin-top: var(--u3);
  }

  .field-label-block {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    font-family: var(--font-mono);
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
