<script lang="ts">
  import { appState } from './store.ts'
  import { AppScreen } from '$shared/app-state.ts'
  import ControlRoom from './views/ControlRoom.svelte'
  import NowPlaying from './views/NowPlaying.svelte'
  import Setup from './views/Setup.svelte'
</script>

<div class="shell">
  <div class="content">
    {#if $appState.screen === Screen.Setup}
      <Setup />
    {:else if $appState.screen === Screen.NowPlaying}
      <NowPlaying />
    {:else}
      <ControlRoom />
    {/if}
  </div>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
