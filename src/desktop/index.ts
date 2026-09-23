import { BrowserWindow, Tray, Updater, Utils } from 'electrobun/main'
import { defineElectrobunRPC } from 'electrobun/main'

import type { MarqueeRPC } from '../shared/rpc-schema.ts'

import { lightsHandlers } from './rpc/lights.ts'
import { setupHandlers } from './rpc/setup.ts'
import { showControlHandlers } from './rpc/show-control.ts'
import { initFromConfig } from './show.ts'
import { pushState, setWindow } from './state.ts'

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

const url = await getMainViewUrl()

const rpc = defineElectrobunRPC<MarqueeRPC>('bun', {
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      ...setupHandlers,
      ...showControlHandlers,
      ...lightsHandlers
    }
  }
})

const w = new BrowserWindow({
  title: 'marquee',
  url,
  frame: { width: 1180, height: 820, x: 160, y: 120 },
  rpc
})

setWindow(w)

w.on('dom-ready', () => {
  pushState()
  initFromConfig().catch(console.error)
})

const tray = new Tray({ title: 'Marquee' })

tray.setMenu([
  { label: 'Show Window', action: 'show' },
  { type: 'separator' },
  { label: 'Quit', action: 'quit' }
])

tray.on('tray-clicked', e => {
  if (e.data.action === 'show') {
    w.show()
  }

  if (e.data.action === 'quit') {
    Utils.quit()
  }
})
