import { Electroview } from 'electrobun/view'

import { appState } from './store.ts'

import type { MarqueeRPC } from '$shared/rpc-schema.ts'

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
      phaseChanged: ({ phase }) => appState.update(s => ({ ...s, phase }))
    }
  }
})

export const ev = new Electroview({ rpc })
