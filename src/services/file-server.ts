import { networkInterfaces } from 'os'

import { MarqueeError } from '../utils/errors.ts'

export interface ServedFile {
  fileUrl: string
  stopServer: () => void
}

function getLocalIp(targetIp: string): string {
  const target = targetIp.split('.').slice(0, 3).join('.')
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (
        iface.family === 'IPv4' &&
        !iface.internal &&
        iface.address.startsWith(target)
      ) {
        return iface.address
      }
    }
  }

  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }

  throw new MarqueeError('Could not determine local IP address.')
}

export function serveFile(filePath: string, targetIp: string): ServedFile {
  const localIp = getLocalIp(targetIp)
  const port = 47820 + Math.floor(Math.random() * 100)
  const fileUrl = `http://${localIp}:${port}/video.mp4`
  const file = Bun.file(filePath)
  const fileSize = file.size

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname !== '/video.mp4') {
        return new Response('Not found', { status: 404 })
      }

      const rangeHeader = req.headers.get('range')
      const baseHeaders = {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      }

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
        const start = match?.[1] ? parseInt(match[1]) : 0
        const end = match?.[2] ? parseInt(match[2]) : fileSize - 1
        const chunkSize = end - start + 1
        return new Response(file.slice(start, end + 1), {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': String(chunkSize)
          }
        })
      }

      return new Response(file, {
        headers: { ...baseHeaders, 'Content-Length': String(fileSize) }
      })
    }
  })

  return { fileUrl, stopServer: () => server.stop(true) }
}
