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
