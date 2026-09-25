import { BrowserWindow, Tray, Updater, Utils, defineElectrobunRPC } from 'electrobun/main'

import { loadUserConfig } from '../config.ts'
import { createWsTransport } from '../server/ws-transport.ts'
import type { WsTransportHandle } from '../server/ws-transport.ts'
import type { MarqueeRPC } from '../shared/rpc-schema.ts'

import { lightsHandlers } from './rpc/lights.ts'
import { serverHandlers } from './rpc/server.ts'
import { setupHandlers } from './rpc/setup.ts'
import { showControlHandlers } from './rpc/show-control.ts'
import { initFromConfig } from './show.ts'
import {
  mutate,
  pushState,
  registerElectrobunBroadcaster,
  registerWsBroadcaster,
  state
} from './state.ts'
import type { StateBroadcaster } from './state.ts'

const DEV_SERVER_URL = 'http://localhost:5173'

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel()
  if (channel === 'dev') {
    try {
      await fetch(DEV_SERVER_URL, { method: 'HEAD' })
      return DEV_SERVER_URL
    } catch {
      console.log('Vite server not running, use bundled build.')
    }
  }
  return 'views://mainview/index.html'
}

if (process.argv.includes('--server')) {
  const userConfig = await loadUserConfig()
  const port = userConfig?.serverPort ?? 4242
  const bind = userConfig?.serverBind === 'network' ? '0.0.0.0' : '127.0.0.1'
  const serverUrl = `http://localhost:${port}`

  const allHandlers = {
    ...setupHandlers,
    ...showControlHandlers,
    ...lightsHandlers,
    ...serverHandlers
  }

  const { broadcaster, start } = createWsTransport(allHandlers, () => state)
  registerWsBroadcaster(broadcaster)
  start(port, bind)

  await initFromConfig()

  if (process.platform !== 'linux') {
    const tray = new Tray({ title: 'Marquee' })
    tray.setMenu([
      { type: 'normal', label: 'Marquee Server', action: 'noop' },
      { type: 'normal', label: 'Open in Browser', action: 'open' },
      { type: 'separator' },
      { type: 'normal', label: 'Quit', action: 'quit' }
    ])
    tray.on('tray-clicked', (e: unknown) => {
      const action = (e as { data: { action: string } }).data.action

      if (action === 'open') {
        Bun.spawn(['open', serverUrl])
      }

      if (action === 'quit') {
        Utils.quit()
      }
    })
  }
} else {
  const url = await getMainViewUrl()

  let wsHandle: WsTransportHandle | null = null
  let w: BrowserWindow
  // eslint-disable-next-line prefer-const
  let tray: Tray

  function desktopTrayMenu() {
    tray.setMenu([
      { type: 'normal', label: 'Show Window', action: 'show' },
      { type: 'separator' },
      { type: 'normal', label: 'Start Server', action: 'server' },
      { type: 'separator' },
      { type: 'normal', label: 'Quit', action: 'quit' }
    ])
  }

  function serverTrayMenu() {
    tray.setMenu([
      { type: 'normal', label: 'Marquee Server', action: 'noop' },
      { type: 'normal', label: 'Open in Browser', action: 'open' },
      { type: 'separator' },
      { type: 'normal', label: 'Back to Desktop', action: 'back' },
      { type: 'separator' },
      { type: 'normal', label: 'Quit', action: 'quit' }
    ])
  }

  const allHandlers = {
    ...setupHandlers,
    ...showControlHandlers,
    ...lightsHandlers,
    ...serverHandlers,

    enableServerMode: async ({
      port,
      bind
    }: MarqueeRPC['bun']['requests']['enableServerMode']['params']) => {
      let devServerUrl: string | undefined
      const viteCheck = await fetch('http://localhost:5173/', {
        method: 'HEAD',
        signal: AbortSignal.timeout(500)
      }).catch(() => null)
      if (viteCheck?.ok) {
        devServerUrl = 'http://localhost:5173'
      }

      const hostname = bind === 'network' ? '0.0.0.0' : '127.0.0.1'
      const serverUrl = `http://localhost:${port}`

      const handle = createWsTransport(allHandlers, () => state, { devServerUrl })
      wsHandle = handle
      registerWsBroadcaster(handle.broadcaster)
      handle.start(port, hostname)

      w.close()
      serverTrayMenu()
      mutate({ serverMode: true, serverUrl })

      return { url: serverUrl }
    },

    disableServerMode: async () => {
      wsHandle?.stop()
      wsHandle = null
      registerWsBroadcaster(null)

      w = new BrowserWindow({
        title: 'marquee',
        url,
        frame: { width: 1180, height: 820, x: 160, y: 120 },
        rpc
      })
      w.on('dom-ready', () => {
        pushState()
      })

      desktopTrayMenu()
      mutate({ serverMode: false, serverUrl: null })
    }
  }

  const rpc = defineElectrobunRPC<MarqueeRPC>('bun', {
    maxRequestTime: 120_000,
    handlers: { requests: allHandlers }
  })

  w = new BrowserWindow({
    title: 'marquee',
    url,
    frame: { width: 1180, height: 820, x: 160, y: 120 },
    rpc
  })

  registerElectrobunBroadcaster(rpc.send as unknown as StateBroadcaster)

  w.on('dom-ready', () => {
    pushState()
    initFromConfig().catch(console.error)
  })

  tray = new Tray({ title: 'Marquee' })
  desktopTrayMenu()

  tray.on('tray-clicked', async (e: unknown) => {
    const action = (e as { data: { action: string } }).data.action

    if (action === 'show') {
      w.show()
    }

    if (action === 'server') {
      const userConfig = await loadUserConfig()
      const port = userConfig?.serverPort ?? 4242
      const bind = userConfig?.serverBind ?? 'localhost'
      await allHandlers.enableServerMode({ port, bind })
    }

    if (action === 'back') {
      await allHandlers.disableServerMode()
    }

    if (action === 'open') {
      Bun.spawn(['open', state.serverUrl ?? ''])
    }

    if (action === 'quit') {
      Utils.quit()
    }
  })
}
