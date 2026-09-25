import type { RPCTransport } from 'electrobun/rpc'
import { Electroview } from 'electrobun/view'
import { writable } from 'svelte/store'

import { appState } from './store.ts'

import type { MarqueeRPC } from '$shared/rpc-schema.ts'

export const pairingProtocol = writable<string | null>(null)

export const rpc = Electroview.defineRPC<MarqueeRPC>({
  maxRequestTime: 60_000,
  handlers: {
    requests: {},
    messages: {
      appStateUpdate: state => appState.set(state),
      setupProgress: ({ message }) => {
        appState.update(s => ({
          ...s,
          log: [...s.log.slice(-49), message]
        }))
      },
      phaseChanged: ({ phase }) => appState.update(s => ({ ...s, phase })),
      pairingPinRequired: ({ protocol }) => pairingProtocol.set(protocol)
    }
  }
})

const isElectrobun =
  typeof window !== 'undefined' &&
  !!(window as unknown as Record<string, unknown>).__electrobunWebviewId

if (isElectrobun) {
  new Electroview({ rpc })
} else {
  rpc.setTransport(createWsTransport(`ws://${window.location.host}/ws`))
}

function createWsTransport(wsUrl: string): RPCTransport {
  let ws: WebSocket | null = null
  let handler: ((msg: unknown) => void) | undefined
  const queue: string[] = []
  let retryDelay = 500

  function connect() {
    ws = new WebSocket(wsUrl)

    ws.addEventListener('open', () => {
      retryDelay = 500
      for (const msg of queue.splice(0)) {
        ws!.send(msg)
      }
    })

    ws.addEventListener('message', ev => {
      if (typeof ev.data !== 'string') {
        return
      }
      const parsed = JSON.parse(ev.data) as unknown
      handler?.(parsed)
    })

    ws.addEventListener('close', () => {
      const delay = retryDelay
      retryDelay = Math.min(retryDelay * 2, 10_000)
      setTimeout(connect, delay)
    })
  }

  connect()

  return {
    send(message: unknown) {
      const msg = JSON.stringify(message)
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(msg)
      } else {
        queue.push(msg)
      }
    },
    registerHandler(h: (msg: unknown) => void) {
      handler = h
    }
  }
}
