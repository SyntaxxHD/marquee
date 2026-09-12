<script lang="ts">
  import { SkipForward, X } from 'lucide-svelte'
  import { rpc } from '../rpc.ts'
  import { appState } from '../store.ts'
  import { CueStatus } from '$shared/app-state.ts'
  import SectionPanel from '../components/SectionPanel.svelte'
  import ProgressTrack from '../components/ProgressTrack.svelte'
  import ReadoutDisplay from '../components/ReadoutDisplay.svelte'
  import LightFader from '../components/LightFader.svelte'
  import IconButton from '../components/IconButton.svelte'
  import StatusBadge from '../components/StatusBadge.svelte'

  let state = $derived($appState)

  let elapsed = $derived(state.playback.elapsedMs)
  let duration = $derived(state.playback.durationMs ?? 0)
  let cueName = $derived(state.playback.cueName ?? '--')
  let nextCue = $derived(state.cues.find(c => c.status === CueStatus.Pending) ?? null)

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  async function handleSkip() {
    await rpc.request.confirmStart()
  }

  async function handleAbort() {
    await rpc.request.cancelShow()
  }

  async function handleLightLevel(lightId: string, level: number) {
    await rpc.request.setLightLevel({ lightId, level })
  }
</script>

<div class="now-playing">
  <SectionPanel label="Now Playing">
    <div class="main-section">
      <div class="cue-header">
        <span class="cue-name">{cueName}</span>
        <StatusBadge state="active" label="playing" />
      </div>

      <ProgressTrack value={elapsed} max={duration || 1} />

      <div class="timestamps">
        <ReadoutDisplay label="Elapsed" value={formatTime(elapsed)} />
        <ReadoutDisplay label="Remaining" value={formatTime(Math.max(0, duration - elapsed))} />
        <ReadoutDisplay label="Total" value={formatTime(duration)} />
      </div>
    </div>

    {#if nextCue}
      <div class="up-next">
        <span class="up-next-label">Up next</span>
        <span class="up-next-name">{nextCue.label}</span>
      </div>
    {/if}
  </SectionPanel>

  <div class="side">
    {#if state.lights.configured}
      <SectionPanel label="Room Lights">
        {#each state.lights.lights as light (light.id)}
          <LightFader
            label={light.name}
            value={light.level}
            onchange={(v) => handleLightLevel(light.id, v)}
          />
        {/each}
      </SectionPanel>
    {/if}

    <SectionPanel label="Transport">
      <div class="transport">
        <IconButton icon={SkipForward} label="Skip" onclick={handleSkip} />
        <IconButton icon={X} label="Abort" onclick={handleAbort} />
      </div>
    </SectionPanel>
  </div>
</div>

<style>
  .now-playing {
    display: grid;
    grid-template-columns: 1fr 240px;
    gap: var(--u4);
    height: 100%;
    padding: var(--u4);
    background: var(--bg-void);
  }

  .main-section {
    display: flex;
    flex-direction: column;
    gap: var(--u4);
  }

  .cue-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--u3);
  }

  .cue-name {
    font-size: 22px;
    font-weight: 500;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }

  .timestamps {
    display: flex;
    gap: var(--u8);
  }

  .up-next {
    margin-top: var(--u5);
    padding-top: var(--u4);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: baseline;
    gap: var(--u3);
  }

  .up-next-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: var(--font-mono);
    flex-shrink: 0;
  }

  .up-next-name {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: var(--u4);
  }

  .transport {
    display: flex;
    gap: var(--u2);
  }
</style>
