import { networkInterfaces } from 'os'

import multicastDns from 'multicast-dns'

import { resolveBinaries } from '../utils/bins.ts'
import { MarqueeError } from '../utils/errors.ts'
import { execOrThrow, exec } from '../utils/exec.ts'
import { logger } from '../utils/logger.ts'

export interface DiscoveredAppleTV {
  name: string
  ip: string
}

export async function discoverAppleTVs(timeoutMs = 5000): Promise<DiscoveredAppleTV[]> {
  return new Promise(resolve => {
    const mdns = multicastDns()
    const found = new Map<string, DiscoveredAppleTV>()
    const addresses = new Map<string, string>()

    mdns.query({ questions: [{ name: '_airplay._tcp.local', type: 'PTR' }] })

    mdns.on('response', packet => {
      for (const answer of [...packet.answers, ...packet.additionals]) {
        if (answer.type === 'A') {
          addresses.set(answer.name, answer.data)
        }
        if (answer.type === 'SRV') {
          const ip = addresses.get(answer.data?.target)
          if (ip) {
            const name = answer.name.replace(/\._airplay\._tcp\.local$/, '')
            found.set(ip, { name, ip })
          }
        }
        if (answer.type === 'PTR' && answer.name === '_airplay._tcp.local') {
          // PTR points to a service instance — SRV/A records may arrive later
        }
      }
    })

    setTimeout(() => {
      mdns.destroy()
      resolve(Array.from(found.values()))
    }, timeoutMs)
  })
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

export async function pairAppleTV(deviceId: string): Promise<void> {
  const bins = await resolveBinaries()
  await execOrThrow([bins.atvremote, '--id', deviceId, '--protocol', 'airplay', 'pair'], {
    errorMessage: `AirPlay pairing failed for device ${deviceId}`
  })
}

export async function playFile(
  filePath: string,
  appleTV: { name: string; id: string }
): Promise<void> {
  const bins = await resolveBinaries()
  const localIp = getLocalIp(appleTV.id)

  const port = 47820 + Math.floor(Math.random() * 100)
  const fileUrl = `http://${localIp}:${port}/video.mp4`

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname !== '/video.mp4') return new Response('Not found', { status: 404 })
      return new Response(Bun.file(filePath))
    }
  })

  logger.debug(`Serving video at ${fileUrl}`)

  try {
    logger.info(`▶️  Sending to ${appleTV.name} (${appleTV.id})`)

    await execOrThrow([bins.atvremote, '--id', appleTV.id, `play_url=${fileUrl}`], {
      errorMessage: `AirPlay stream failed. Ensure the device is reachable and pairing is valid.`
    })

    await waitForPlaybackEnd(bins.atvremote, appleTV.id)
  } finally {
    server.stop(true)
  }
}

async function waitForPlaybackEnd(atvremote: string, deviceId: string): Promise<void> {
  logger.debug('Polling playback state...')
  const maxPolls = 720 // 1 hour max
  for (let i = 0; i < maxPolls; i++) {
    await Bun.sleep(5000)
    const result = await exec([atvremote, '--id', deviceId, 'playing'], {
      captureOutput: true,
      silent: true
    })
    if (result.exitCode !== 0) break
    const state = result.stdout.toLowerCase()

    if (state.includes('devicestate: idle') || state.includes('devicestate: stopped'))
      break
  }
}
