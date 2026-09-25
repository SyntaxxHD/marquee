<script lang="ts">
  import { Check } from 'lucide-svelte'
  import { AppScreen } from '$shared/app-state.ts'
  import type { UserConfig } from '../../config.ts'
  import { rpc } from '../rpc.ts'
  import Button from '../components/Button.svelte'
  import { Section, SectionState } from './setup-enums.ts'
  import SetupContent from './SetupContent.svelte'
  import SetupDeployment from './SetupDeployment.svelte'
  import SetupLights from './SetupLights.svelte'
  import SetupOutput from './SetupOutput.svelte'
  import SetupPlayback from './SetupPlayback.svelte'

  let activeSection = $state<Section>(Section.Playback)

  let sectionStates = $state<Record<Section, SectionState>>({
    [Section.Playback]: SectionState.Active,
    [Section.Content]: SectionState.Pending,
    [Section.Output]: SectionState.Pending,
    [Section.Lights]: SectionState.Pending,
    [Section.Deployment]: SectionState.Pending
  })

  let config = $state<UserConfig | null>(null)

  let contentRef = $state<{ save: () => Promise<void> } | undefined>(undefined)
  let outputRef = $state<{ save: () => Promise<void> } | undefined>(undefined)
  let lightsRef = $state<{ save: () => Promise<void> } | undefined>(undefined)
  let deploymentRef = $state<{ save: () => Promise<void> } | undefined>(undefined)

  function setSection(s: Section) {
    activeSection = s
  }

  function markDone(s: Section) {
    sectionStates[s] = SectionState.Done
  }

  async function finish() {
    if (activeSection === Section.Content) {
      await contentRef?.save()
    } else if (activeSection === Section.Output) {
      await outputRef?.save()
    } else if (activeSection === Section.Lights) {
      await lightsRef?.save()
    } else if (activeSection === Section.Deployment) {
      await deploymentRef?.save()
    }
    await rpc.request.navigateTo({ screen: AppScreen.ControlRoom })
  }

  $effect(() => {
    loadExisting()
  })

  async function loadExisting() {
    config = await rpc.request.getFullConfig()
    if (!config) {
      return
    }
    if (config.streamTarget) {
      markDone(Section.Playback)
    }
    if (config.adSourceConfig || config.trailerSourceConfig) {
      markDone(Section.Content)
    }
    if (config.outputResolution && config.outputFps) {
      markDone(Section.Output)
    }
    if (config.lights) {
      markDone(Section.Lights)
    }
  }

  const SECTIONS: { id: Section; label: string }[] = [
    { id: Section.Playback, label: 'Playback Device' },
    { id: Section.Content, label: 'Content' },
    { id: Section.Output, label: 'Output' },
    { id: Section.Lights, label: 'Lights' },
    { id: Section.Deployment, label: 'Deployment' }
  ]
</script>

<div class="setup">
  <div class="wizard-topbar">
    <button
      class="wizard-back"
      onclick={() => rpc.request.navigateTo({ screen: AppScreen.ControlRoom })}
    >← Back</button>
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
            disabled={state === SectionState.Pending &&
              s.id !== Section.Lights &&
              s.id !== Section.Deployment}
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
            {#if s.id === Section.Lights || s.id === Section.Deployment}
              <span class="step-opt">opt.</span>
            {/if}
          </button>
        {/each}
      </div>

      <div class="sidebar-footer">
        <Button variant="primary" onclick={finish}>Finish Setup</Button>
      </div>
    </nav>

    <main class="content">
      {#if activeSection === Section.Playback}
        <SetupPlayback
          {config}
          oncomplete={() => {
            markDone(Section.Playback)
            setSection(Section.Content)
          }}
        />
      {:else if activeSection === Section.Content}
        <SetupContent
          {config}
          bind:this={contentRef}
          oncomplete={() => {
            markDone(Section.Content)
            setSection(Section.Output)
          }}
        />
      {:else if activeSection === Section.Output}
        <SetupOutput
          {config}
          bind:this={outputRef}
          oncomplete={() => {
            markDone(Section.Output)
            setSection(Section.Lights)
          }}
        />
      {:else if activeSection === Section.Lights}
        <SetupLights
          {config}
          bind:this={lightsRef}
          oncomplete={() => {
            markDone(Section.Lights)
            setSection(Section.Deployment)
          }}
          onskip={() => markDone(Section.Lights)}
        />
      {:else if activeSection === Section.Deployment}
        <SetupDeployment {config} bind:this={deploymentRef} />
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
    transition: background var(--transition-fast), color var(--transition-fast),
      border-color var(--transition-fast);
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

  :global(.section-wrap) {
    max-width: 560px;
    padding: var(--u8) var(--u8);
    display: flex;
    flex-direction: column;
    gap: var(--u4);
  }

  :global(.section-head) {
    display: flex;
    align-items: flex-start;
    gap: var(--u4);
    margin-bottom: var(--u2);
  }

  :global(.section-head-icon) {
    color: var(--text-secondary);
    flex-shrink: 0;
    margin-top: 2px;
  }

  :global(.section-title) {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--u1);
    font-family: var(--font-sans);
  }

  :global(.section-desc) {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  :global(.card-list) {
    display: flex;
    flex-direction: column;
    gap: var(--u2);
  }

  :global(.step-actions) {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--u2);
  }

  :global(.centered) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--u3);
    padding: var(--u6) 0;
  }

  :global(.hint-text) {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0 0 var(--u3);
    line-height: 1.5;
  }

  :global(.hint-text-sm) {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0 0 var(--u3);
  }

  :global(.error-msg) {
    font-size: 12px;
    font-family: var(--font-mono);
    color: #ef5350;
    margin: var(--u2) 0 0;
  }

  :global(.empty-state) {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0;
    padding: var(--u4) 0;
  }

  :global(.field-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--u2) 0;
  }

  :global(.field-label) {
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }
</style>
