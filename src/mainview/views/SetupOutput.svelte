<script lang="ts">
  import type { OutputFps, OutputResolution, UserConfig } from '../../config.ts'
  import { rpc } from '../rpc.ts'
  import Button from '../components/Button.svelte'
  import RadioCard from '../components/RadioCard.svelte'
  import SectionPanel from '../components/SectionPanel.svelte'

  interface Props {
    config: UserConfig | null
    oncomplete: () => void
  }
  let { config, oncomplete }: Props = $props()

  let outputResolution = $state<OutputResolution>('1920x1080')
  let outputFps = $state<OutputFps>(25)

  let initialized = false
  $effect(() => {
    if (!config || initialized) return
    initialized = true
    if (config.outputResolution) {
      outputResolution = config.outputResolution
    }
    if (config.outputFps) {
      outputFps = config.outputFps
    }
  })

  async function handleContinue() {
    await rpc.request.saveConfigFields({ fields: { outputResolution, outputFps } })
    oncomplete()
  }

  export async function save(): Promise<void> {
    await rpc.request.saveConfigFields({ fields: { outputResolution, outputFps } })
  }
</script>

<div class="section-wrap">
  <div class="section-head">
    <div>
      <h2 class="section-title">Output</h2>
      <p class="section-desc">Select resolution and frame rate for the assembled pre-show file.</p>
    </div>
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
    <Button variant="primary" onclick={handleContinue}>Continue</Button>
  </div>
</div>
