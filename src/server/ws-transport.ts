import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { Server, ServerWebSocket } from 'bun'

import type { AppState, ShowPhase } from '../shared/app-state.ts'
import type { MarqueeRPC } from '../shared/rpc-schema.ts'

export type StateBroadcaster = {
  appStateUpdate(payload: AppState): void
  setupProgress(payload: { message: string }): void
  phaseChanged(payload: { phase: ShowPhase }): void
  pairingPinRequired(payload: { protocol: string }): void
}

type RequestMap = MarqueeRPC['bun']['requests']
type HandlerMap = {
  [K in keyof RequestMap]?: (
    params: RequestMap[K]['params']
  ) => Promise<RequestMap[K]['response']>
}

type WireRequest = { type: 'request'; id: number; method: string; params: unknown }

export interface WsTransportHandle {
  broadcaster: StateBroadcaster
  start(port: number, bind: string): void
  stop(): void
}

function resolveDistDir() {
  const bundleViews = join(import.meta.dirname, '../views/mainview')

  if (existsSync(bundleViews)) {
    return bundleViews
  }

  const cwdDist = join(process.cwd(), 'dist')

  if (existsSync(cwdDist)) {
    return cwdDist
  }

  return cwdDist
}

export function createWsTransport(
  handlers: HandlerMap,
  getState: () => AppState,
  options?: { devServerUrl?: string }
): WsTransportHandle {
  const distDir = process.env.MARQUEE_DIST ?? resolveDistDir()
  const devServerUrl = options?.devServerUrl
  const clients = new Set<ServerWebSocket<unknown>>()

  function broadcastRaw(packet: unknown) {
    const msg = JSON.stringify(packet)
    for (const client of clients) {
      try {
        client.send(msg)
      } catch {
        clients.delete(client)
      }
    }
  }

  const broadcaster: StateBroadcaster = {
    appStateUpdate: p =>
      broadcastRaw({ type: 'message', id: 'appStateUpdate', payload: p }),
    setupProgress: p =>
      broadcastRaw({ type: 'message', id: 'setupProgress', payload: p }),
    phaseChanged: p => broadcastRaw({ type: 'message', id: 'phaseChanged', payload: p }),
    pairingPinRequired: p =>
      broadcastRaw({ type: 'message', id: 'pairingPinRequired', payload: p })
  }

  async function handleFetch(
    req: Request,
    srv: Server<unknown>
  ): Promise<Response | undefined> {
    if (srv.upgrade(req, { data: undefined })) {
      return undefined
    }

    const url = new URL(req.url)

    if (devServerUrl) {
      const proxied = await fetch(`${devServerUrl}${url.pathname}${url.search}`).catch(
        () => null
      )

      if (proxied) {
        return proxied
      }
    }

    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const filePath = join(distDir, pathname)

    if (existsSync(filePath)) {
      return new Response(Bun.file(filePath))
    }

    const indexPath = join(distDir, 'index.html')
    if (existsSync(indexPath)) {
      return new Response(Bun.file(indexPath), {
        headers: { 'Content-Type': 'text/html' }
      })
    }

    return new Response('UI not built — run: bun x vite build', { status: 404 })
  }

  const wsHandlers = {
    open(ws: ServerWebSocket<unknown>) {
      clients.add(ws)
      ws.send(
        JSON.stringify({ type: 'message', id: 'appStateUpdate', payload: getState() })
      )
    },
    close(ws: ServerWebSocket<unknown>) {
      clients.delete(ws)
    },
    async message(ws: ServerWebSocket<unknown>, raw: string | Buffer) {
      let packet: unknown
      try {
        packet = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString())
      } catch {
        return
      }

      if (
        typeof packet !== 'object' ||
        packet === null ||
        (packet as WireRequest).type !== 'request'
      ) {
        return
      }

      const { id, method, params } = packet as WireRequest

      const handler = (handlers as Record<string, (p: unknown) => Promise<unknown>>)[
        method
      ]

      if (!handler) {
        ws.send(
          JSON.stringify({
            type: 'response',
            id,
            success: false,
            error: `Unknown method: ${method}`
          })
        )
        return
      }

      try {
        const payload = await handler(params)
        ws.send(JSON.stringify({ type: 'response', id, success: true, payload }))
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: 'response',
            id,
            success: false,
            error: (err as Error).message
          })
        )
      }
    }
  }

  let server: ReturnType<typeof Bun.serve> | null = null

  function start(port: number, bind: string) {
    server = Bun.serve({
      port,
      hostname: bind,
      fetch: handleFetch,
      websocket: wsHandlers
    })
  }

  function stop() {
    server?.stop(true)
    server = null
    clients.clear()
  }

  return { broadcaster, start, stop }
}
