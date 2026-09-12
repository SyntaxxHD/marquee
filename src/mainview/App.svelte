<script lang="ts">
  import { appState } from './store.ts'
  import { AppScreen } from '$shared/app-state.ts'
  import ControlRoom from './views/ControlRoom.svelte'
  import NowPlaying from './views/NowPlaying.svelte'
  import Setup from './views/Setup.svelte'
  import Toast from './components/Toast.svelte'
</script>

<div class="shell">
  <div class="content">
    {#if $appState.screen === AppScreen.Setup}
      <Setup />
    {:else if $appState.screen === AppScreen.NowPlaying}
      <NowPlaying />
    {:else}
      <ControlRoom />
    {/if}
  </div>
  <Toast />
  <span class="build-id">b08</span>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    position: relative;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .build-id {
    position: absolute;
    bottom: 6px;
    right: 8px;
    font-family: monospace;
    font-size: 10px;
    opacity: 0.3;
    pointer-events: none;
    user-select: none;
  }
</style>
