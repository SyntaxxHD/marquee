<script lang="ts">
  import { ChevronDown } from 'lucide-svelte'
  import { SourceFieldType, SourceKind } from '$shared/rpc-schema.ts'
  import type { SourcePluginInfo } from '$shared/rpc-schema.ts'
  import type { UserConfig } from '../../config.ts'
  import { rpc } from '../rpc.ts'
  import Button from '../components/Button.svelte'
  import SectionPanel from '../components/SectionPanel.svelte'
  import Spinner from '../components/Spinner.svelte'
  import StatusBadge from '../components/StatusBadge.svelte'
  import TextInput from '../components/TextInput.svelte'

  interface Props {
    config: UserConfig | null
    oncomplete: () => void
  }
  let { config, oncomplete }: Props = $props()

  let adSources = $state<SourcePluginInfo[]>([])
  let trailerSources = $state<SourcePluginInfo[]>([])
  let selectedAdSourceId = $state('local')
  let selectedTrailerSourceId = $state('local')
  let adConfig = $state<Record<string, string>>({})
  let trailerConfig = $state<Record<string, string>>({})
  let adValidated = $state<boolean | null>(null)
  let adValidating = $state(false)
  let trailerValidated = $state<boolean | null>(null)
  let trailerValidating = $state(false)
  let adSelectionMode = $state<'count' | 'duration'>('count')
  let adCount = $state(4)
  let adTargetDurationMin = $state(5)
  let adMaxVideoLengthMin = $state(1)
  let trailerSelectionMode = $state<'count' | 'duration'>('count')
  let trailerCount = $state(3)
  let trailerTargetDurationMin = $state(10)
  let trailerMaxVideoLengthMin = $state(0)

  let activeAdSource = $derived(adSources.find(s => s.id === selectedAdSourceId) ?? null)
  let activeTrailerSource = $derived(
    trailerSources.find(s => s.id === selectedTrailerSourceId) ?? null
  )

  let initialized = false
  $effect(() => {
    if (!config || initialized) return
    initialized = true

    if (config.adSourceConfig) {
      selectedAdSourceId = config.adSourceConfig.type
      const { type: _adType, ...adFields } = config.adSourceConfig as Record<string, unknown>
      adConfig = adFields as Record<string, string>
    }

    if (config.trailerSourceConfig) {
      selectedTrailerSourceId = config.trailerSourceConfig.type
      const { type: _trailerType, ...trailerFields } =
        config.trailerSourceConfig as Record<string, unknown>
      trailerConfig = trailerFields as Record<string, string>
      if (config.trailerSourceConfig.type === 'tmdb' && config.trailerSourceConfig.apiKey) {
        trailerValidated = true
      }
    }

    adSelectionMode = config.adSelectionMode ?? 'count'
    adCount = config.adCount ?? 4
    adTargetDurationMin = config.adTargetDurationMin ?? 5
    adMaxVideoLengthMin = config.adMaxVideoLengthMin ?? 1
    trailerSelectionMode = config.trailerSelectionMode ?? 'count'
    trailerCount = config.trailerCount ?? 3
    trailerTargetDurationMin = config.trailerTargetDurationMin ?? 10
    trailerMaxVideoLengthMin = config.trailerMaxVideoLengthMin ?? 0
  })

  $effect(() => {
    Promise.all([rpc.request.listAdSources(), rpc.request.listTrailerSources()]).then(
      ([ads, trailers]) => {
        adSources = ads
        trailerSources = trailers
      }
    )
  })

  function sourceIsReady(
    info: SourcePluginInfo | null,
    cfg: Record<string, string>,
    validated: boolean | null
  ): boolean {
    if (!info) {
      return false
    }
    const allRequiredFilled = info.configFields
      .filter(f => f.required)
      .every(f => (cfg[f.key] ?? '').trim().length > 0)
    if (!allRequiredFilled) {
      return false
    }
    if (info.requiresValidation && validated !== true) {
      return false
    }
    return true
  }

  let contentCanContinue = $derived(
    sourceIsReady(activeAdSource, adConfig, adValidated) &&
      sourceIsReady(activeTrailerSource, trailerConfig, trailerValidated)
  )

  async function validateSource(kind: SourceKind) {
    if (kind === SourceKind.Ad) {
      adValidating = true
      adValidated = null
      try {
        adValidated = await rpc.request.validateSourceConfig({
          kind: SourceKind.Ad,
          config: { type: selectedAdSourceId, ...adConfig } as never
        })
      } finally {
        adValidating = false
      }
    } else {
      trailerValidating = true
      trailerValidated = null
      try {
        trailerValidated = await rpc.request.validateSourceConfig({
          kind: SourceKind.Trailer,
          config: { type: selectedTrailerSourceId, ...trailerConfig } as never
        })
      } finally {
        trailerValidating = false
      }
    }
  }

  async function saveContent() {
    await rpc.request.saveConfigFields({
      fields: {
        adSourceConfig: { type: selectedAdSourceId, ...adConfig } as never,
        adSelectionMode,
        adCount,
        adTargetDurationMin,
        adMaxVideoLengthMin: adMaxVideoLengthMin <= 0 ? null : adMaxVideoLengthMin,
        trailerSourceConfig: { type: selectedTrailerSourceId, ...trailerConfig } as never,
        trailerSelectionMode,
        trailerCount,
        trailerTargetDurationMin,
        trailerMaxVideoLengthMin: trailerMaxVideoLengthMin <= 0 ? null : trailerMaxVideoLengthMin
      }
    })
  }

  async function handleContinue() {
    await saveContent()
    oncomplete()
  }

  export async function save(): Promise<void> {
    if (contentCanContinue) {
      await saveContent()
    }
  }
</script>

<div class="section-wrap">
  <div class="section-head">
    <div>
      <h2 class="section-title">Content</h2>
      <p class="section-desc">Configure trailer and ad sources for the pre-show.</p>
    </div>
  </div>

  <SectionPanel label="Trailers">
    <div class="field-row">
      <span class="field-label">Source</span>
      <div class="lang-select-wrap">
        <select
          class="lang-select"
          value={selectedTrailerSourceId}
          onchange={e => {
            selectedTrailerSourceId = (e.target as HTMLSelectElement).value
            trailerConfig = {}
            trailerValidated = null
          }}
        >
          {#each trailerSources as src}
            <option value={src.id}>{src.label}</option>
          {/each}
        </select>
        <span class="lang-chevron"><ChevronDown size={14} /></span>
      </div>
    </div>

    {#if activeTrailerSource}
      {#each activeTrailerSource.configFields as field (field.key)}
        <div class="field-group">
          <label class="field-label-block">{field.label}</label>
          {#if field.type === SourceFieldType.Select}
            <div class="lang-select-wrap">
              <select
                class="lang-select"
                value={trailerConfig[field.key] ?? ''}
                onchange={e => {
                  trailerConfig = {
                    ...trailerConfig,
                    [field.key]: (e.target as HTMLSelectElement).value
                  }
                  trailerValidated = null
                }}
              >
                {#each (field.options ?? []) as opt}
                  <option value={opt.code}>{opt.label}</option>
                {/each}
              </select>
              <span class="lang-chevron"><ChevronDown size={14} /></span>
            </div>
          {:else}
            <TextInput
              value={trailerConfig[field.key] ?? ''}
              placeholder={field.placeholder ?? ''}
              hint={field.hint}
              type={field.type === SourceFieldType.Password ? 'password' : 'text'}
              onchange={v => {
                trailerConfig = { ...trailerConfig, [field.key]: v }
                trailerValidated = null
              }}
            />
          {/if}
        </div>
      {/each}

      {#if activeTrailerSource.requiresValidation}
        <div class="validate-row">
          <Button
            variant="ghost"
            onclick={() => validateSource(SourceKind.Trailer)}
            disabled={trailerValidating ||
              !sourceIsReady(activeTrailerSource, trailerConfig, null)}
          >
            {#if trailerValidating}<Spinner size={12} />{:else}Validate{/if}
          </Button>
          {#if trailerValidated === true}
            <StatusBadge state="done" label="Key valid" variant="plain" />
          {:else if trailerValidated === false}
            <StatusBadge state="fault" label="Invalid key" variant="plain" />
          {/if}
        </div>
      {/if}
    {/if}

    <div class="field-row">
      <span class="field-label">Selection</span>
      <div class="toggle-pair">
        <button
          class="toggle-opt"
          class:is-active={trailerSelectionMode === 'count'}
          onclick={() => {
            trailerSelectionMode = 'count'
          }}
        >Count</button>
        <button
          class="toggle-opt"
          class:is-active={trailerSelectionMode === 'duration'}
          onclick={() => {
            trailerSelectionMode = 'duration'
          }}
        >Duration</button>
      </div>
    </div>

    {#if trailerSelectionMode === 'count'}
      <div class="field-row field-row--count">
        <label class="field-label-block" for="trailer-count">Count</label>
        <input
          id="trailer-count"
          class="number-input"
          type="number"
          min="1"
          max="20"
          bind:value={trailerCount}
        />
      </div>
    {:else}
      <div class="field-row field-row--count">
        <label class="field-label-block" for="trailer-duration">Target</label>
        <div class="duration-input-row">
          <input
            id="trailer-duration"
            class="number-input"
            type="number"
            min="1"
            max="120"
            bind:value={trailerTargetDurationMin}
          />
          <span class="field-label">min</span>
        </div>
      </div>
    {/if}

    <div class="field-row field-row--count">
      <label class="field-label-block" for="trailer-maxlen">Max per video</label>
      <div class="duration-input-row">
        <input
          id="trailer-maxlen"
          class="number-input"
          type="number"
          min="0"
          bind:value={trailerMaxVideoLengthMin}
        />
        <span class="field-label">{trailerMaxVideoLengthMin <= 0 ? '∞' : 'min'}</span>
      </div>
    </div>
  </SectionPanel>

  <SectionPanel label="Ads">
    <div class="field-row">
      <span class="field-label">Source</span>
      <div class="lang-select-wrap">
        <select
          class="lang-select"
          value={selectedAdSourceId}
          onchange={e => {
            selectedAdSourceId = (e.target as HTMLSelectElement).value
            adConfig = {}
            adValidated = null
          }}
        >
          {#each adSources as src}
            <option value={src.id}>{src.label}</option>
          {/each}
        </select>
        <span class="lang-chevron"><ChevronDown size={14} /></span>
      </div>
    </div>

    {#if activeAdSource}
      {#each activeAdSource.configFields as field (field.key)}
        <div class="field-group">
          <label class="field-label-block">{field.label}</label>
          {#if field.type === SourceFieldType.Select}
            <div class="lang-select-wrap">
              <select
                class="lang-select"
                value={adConfig[field.key] ?? ''}
                onchange={e => {
                  adConfig = {
                    ...adConfig,
                    [field.key]: (e.target as HTMLSelectElement).value
                  }
                  adValidated = null
                }}
              >
                {#each (field.options ?? []) as opt}
                  <option value={opt.code}>{opt.label}</option>
                {/each}
              </select>
              <span class="lang-chevron"><ChevronDown size={14} /></span>
            </div>
          {:else}
            <TextInput
              value={adConfig[field.key] ?? ''}
              placeholder={field.placeholder ?? ''}
              hint={field.hint}
              type={field.type === SourceFieldType.Password ? 'password' : 'text'}
              onchange={v => {
                adConfig = { ...adConfig, [field.key]: v }
                adValidated = null
              }}
            />
          {/if}
        </div>
      {/each}

      {#if activeAdSource.requiresValidation}
        <div class="validate-row">
          <Button
            variant="ghost"
            onclick={() => validateSource(SourceKind.Ad)}
            disabled={adValidating || !sourceIsReady(activeAdSource, adConfig, null)}
          >
            {#if adValidating}<Spinner size={12} />{:else}Validate{/if}
          </Button>
          {#if adValidated === true}
            <StatusBadge state="done" label="Key valid" variant="plain" />
          {:else if adValidated === false}
            <StatusBadge state="fault" label="Invalid key" variant="plain" />
          {/if}
        </div>
      {/if}
    {/if}

    <div class="field-row">
      <span class="field-label">Selection</span>
      <div class="toggle-pair">
        <button
          class="toggle-opt"
          class:is-active={adSelectionMode === 'count'}
          onclick={() => {
            adSelectionMode = 'count'
          }}
        >Count</button>
        <button
          class="toggle-opt"
          class:is-active={adSelectionMode === 'duration'}
          onclick={() => {
            adSelectionMode = 'duration'
          }}
        >Duration</button>
      </div>
    </div>

    {#if adSelectionMode === 'count'}
      <div class="field-row field-row--count">
        <label class="field-label-block" for="ad-count">Count</label>
        <input
          id="ad-count"
          class="number-input"
          type="number"
          min="1"
          max="20"
          bind:value={adCount}
        />
      </div>
    {:else}
      <div class="field-row field-row--count">
        <label class="field-label-block" for="ad-duration">Target</label>
        <div class="duration-input-row">
          <input
            id="ad-duration"
            class="number-input"
            type="number"
            min="1"
            max="60"
            bind:value={adTargetDurationMin}
          />
          <span class="field-label">min</span>
        </div>
      </div>
    {/if}

    <div class="field-row field-row--count">
      <label class="field-label-block" for="ad-maxlen">Max per video</label>
      <div class="duration-input-row">
        <input
          id="ad-maxlen"
          class="number-input"
          type="number"
          min="0"
          bind:value={adMaxVideoLengthMin}
        />
        <span class="field-label">{adMaxVideoLengthMin <= 0 ? '∞' : 'min'}</span>
      </div>
    </div>
  </SectionPanel>

  <div class="step-actions">
    <Button variant="primary" disabled={!contentCanContinue} onclick={handleContinue}>
      Continue
    </Button>
  </div>
</div>

<style>
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--u2);
    margin-top: var(--u3);
  }

  .field-row--count {
    margin-top: var(--u3);
  }

  .field-label-block {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .validate-row {
    display: flex;
    align-items: center;
    gap: var(--u3);
    margin-top: var(--u3);
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

  .toggle-pair {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .toggle-opt {
    padding: var(--u1) var(--u3);
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .toggle-opt + .toggle-opt {
    border-left: 1px solid var(--border);
  }

  .toggle-opt:hover {
    color: var(--text-secondary);
    background: var(--bg-raised);
  }

  .toggle-opt.is-active {
    color: var(--amber);
    background: rgba(212, 147, 10, 0.06);
  }
</style>
