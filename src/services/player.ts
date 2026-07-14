import { mkdir } from 'fs/promises'
import { networkInterfaces } from 'os'
import { dirname } from 'path'

import multicastDns from 'multicast-dns'

import { PYATV_STORAGE_FILE } from '../config.ts'
import { resolveBinaries } from '../utils/bins.ts'
import { MarqueeError } from '../utils/errors.ts'
import { execOrThrow, exec } from '../utils/exec.ts'
import { logger } from '../utils/logger.ts'

export interface DiscoveredAppleTV {
  name: string
  ip: string
}

export interface AppleTVTarget {
  name: string
  id: string
  address: string
}

export async function discoverAppleTVs(timeoutMs = 5000): Promise<DiscoveredAppleTV[]> {
  return new Promise(resolve => {
    const mdns = multicastDns()

    const services = new Map<string, string>()
    const addresses = new Map<string, string>()

    mdns.query({ questions: [{ name: '_airplay._tcp.local', type: 'PTR' }] })

    mdns.on('response', packet => {
      for (const answer of [...packet.answers, ...packet.additionals]) {
        if (answer.type === 'A') {
          addresses.set(answer.name, answer.data)
        }
        if (answer.type === 'SRV' && answer.name.endsWith('._airplay._tcp.local')) {
          const target = (answer.data as { target?: string })?.target
          if (target) services.set(answer.name, target)
        }
      }
    })

    setTimeout(() => {
      mdns.destroy()

      const found = new Map<string, DiscoveredAppleTV>()
      for (const [service, target] of services) {
        const ip = addresses.get(target)
        if (!ip) continue

        const name = service.replace(/\._airplay\._tcp\.local$/, '')
        found.set(ip, { name, ip })
      }

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

async function resolveIdentifier(address: string): Promise<string> {
  const bins = await resolveBinaries()
  const result = await exec([bins.atvremote, '--scan-hosts', address, 'scan'], {
    captureOutput: true,
    silent: true
  })

  const lines = result.stdout.split('\n')
  const idLines: string[] = []
  let inIds = false
  for (const line of lines) {
    if (line.trim().startsWith('Identifiers:')) {
      inIds = true
      continue
    }
    if (inIds) {
      const m = line.match(/^\s*-\s*(.+?)\s*$/)
      if (m) idLines.push(m[1])
      else break
    }
  }

  const uuid = idLines.find(id => /^[0-9A-Fa-f-]{36}$/.test(id))
  const identifier = uuid ?? idLines[0]
  if (!identifier) {
    throw new MarqueeError(
      `Could not resolve an identifier for Apple TV at ${address}. Is it powered on?`
    )
  }
  return identifier
}

function atvremoteArgs(atvremote: string, target: AppleTVTarget): string[] {
  return [
    atvremote,
    '--storage-filename',
    PYATV_STORAGE_FILE,
    '--id',
    target.id,
    '--address',
    target.address
  ]
}

// Probes whether stored pairing credentials still work. `app` is served over
// Companion, which requires valid pairing, so exit 0 means we are still paired.
export async function probeAppleTV(target: AppleTVTarget): Promise<boolean> {
  const bins = await resolveBinaries()
  const args = [...atvremoteArgs(bins.atvremote, target), 'app']
  const result = await exec(args, { captureOutput: true, silent: true })
  return result.exitCode === 0
}

export async function pairAppleTV(target: AppleTVTarget): Promise<void> {
  const bins = await resolveBinaries()

  await mkdir(dirname(PYATV_STORAGE_FILE), { recursive: true })

  for (const protocol of ['companion', 'airplay']) {
    const label = protocol === 'companion' ? 'control' : 'AirPlay'
    logger.info(`Enter the ${label} PIN shown on your TV:`)

    const args = [
      ...atvremoteArgs(bins.atvremote, target),
      '--protocol',
      protocol,
      'pair'
    ]
    await execOrThrow(args, {
      inheritStdin: true,
      discardOutput: true,
      errorMessage: `${protocol} pairing failed for ${target.name} (${target.address})`
    })
  }
}

export async function resolveTarget(
  name: string,
  address: string
): Promise<AppleTVTarget> {
  const id = await resolveIdentifier(address)
  return { name, id, address }
}

export async function playFile(filePath: string, appleTV: AppleTVTarget): Promise<void> {
  const bins = await resolveBinaries()
  const localIp = getLocalIp(appleTV.address)

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
    logger.info(`▶️  Sending to ${appleTV.name} (${appleTV.address})`)

    const args = [...atvremoteArgs(bins.atvremote, appleTV), `play_url=${fileUrl}`]
    const result = await exec(args, { captureOutput: true, silent: true })

    if (result.exitCode !== 0) {
      const isTvOs26PollingBug =
        result.stderr.includes('playback-info') && result.stderr.includes('500')
      if (!isTvOs26PollingBug) {
        throw new MarqueeError(
          'AirPlay stream failed. Ensure the device is reachable and pairing is valid.'
        )
      }
      logger.debug('Ignoring tvOS play_url playback-info 500 (playback started)')
    }

    await waitForPlaybackEnd(bins.atvremote, appleTV)
  } finally {
    server.stop(true)
  }
}

async function waitForPlaybackEnd(
  atvremote: string,
  target: AppleTVTarget
): Promise<void> {
  logger.debug('Polling playback state...')
  const maxPolls = 720 // 1 hour max
  for (let i = 0; i < maxPolls; i++) {
    await Bun.sleep(5000)
    const args = [...atvremoteArgs(atvremote, target), 'playing']
    const result = await exec(args, { captureOutput: true, silent: true })
    if (result.exitCode !== 0) break
    const state = result.stdout.toLowerCase()

    if (state.includes('devicestate: idle') || state.includes('devicestate: stopped'))
      break
  }
}
