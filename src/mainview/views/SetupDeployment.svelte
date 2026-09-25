<script lang="ts">
  import type { UserConfig } from '../../config.ts'
  import { rpc } from '../rpc.ts'
  import RadioCard from '../components/RadioCard.svelte'
  import SectionPanel from '../components/SectionPanel.svelte'
  import TextInput from '../components/TextInput.svelte'
  import ToggleSwitch from '../components/ToggleSwitch.svelte'

  interface Props {
    config: UserConfig | null
  }
  let { config }: Props = $props()

  let serverPort = $state('4242')
  let serverBind = $state<'localhost' | 'network'>('localhost')
  let autostartEnabled = $state(false)

  let initialized = false
  $effect(() => {
    if (!config || initialized) return
    initialized = true

    if (config.serverPort) {
      serverPort = String(config.serverPort)
    }

    if (config.serverBind) {
      serverBind = config.serverBind
    }

    autostartEnabled = config.autostart ?? false
  })

  async function toggleAutostart(enabled: boolean) {
    autostartEnabled = enabled
    await rpc.request.setAutostart({ enabled })
  }

  export async function save(): Promise<void> {
    await rpc.request.saveConfigFields({
      fields: { serverPort: parseInt(serverPort, 10), serverBind }
    })
  }
</script>

<div class="section-wrap">
  <div class="section-head">
    <div>
      <h2 class="section-title">Deployment</h2>
      <p class="section-desc">
        Run marquee as a headless server, accessible from any browser on your network.
      </p>
    </div>
  </div>

  <SectionPanel label="Server Port">
    <TextInput
      bind:value={serverPort}
      placeholder="4242"
      hint="Port the HTTP/WebSocket server listens on (1024-65535)"
    />
  </SectionPanel>

  <SectionPanel label="Bind Address">
    <div class="card-list">
      <RadioCard
        value="localhost"
        bind:group={serverBind}
        label="Localhost only"
        description="Only accessible from this machine"
      />
      <RadioCard
        value="network"
        bind:group={serverBind}
        label="Local network"
        description="Accessible from any device on your network"
      />
    </div>
  </SectionPanel>

  <SectionPanel label="Autostart">
    <div class="field-row">
      <span class="field-label">Start server on login</span>
      <ToggleSwitch checked={autostartEnabled} onchange={toggleAutostart} />
    </div>
    <p class="hint-text">Automatically launch the server when you log in.</p>
  </SectionPanel>
</div>
