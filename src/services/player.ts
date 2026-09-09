import { mkdir } from 'fs/promises'
import { dirname } from 'path'

import multicastDns from 'multicast-dns'

import { PYATV_STORAGE_FILE } from '../config.ts'
import { resolveBinaries } from '../utils/bins.ts'
import { MarqueeError } from '../utils/errors.ts'
import { execOrThrow, exec } from '../utils/exec.ts'

import { serveFile } from './file-server.ts'

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
    console.log(`Enter the ${label} PIN shown on your TV:`)

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

export async function playViaAppleTV(
  filePath: string,
  appleTV: AppleTVTarget
): Promise<void> {
  const bins = await resolveBinaries()
  const { fileUrl, stopServer } = serveFile(filePath, appleTV.address)

  try {
    console.log(`Sending to ${appleTV.name} (${appleTV.address})`)

    const args = [...atvremoteArgs(bins.atvremote, appleTV), `play_url=${fileUrl}`]
    await exec(args, { captureOutput: true, silent: true })

    await waitForPlaybackEnd(bins.atvremote, appleTV)
  } finally {
    stopServer()
  }
}

async function waitForPlaybackEnd(
  atvremote: string,
  target: AppleTVTarget
): Promise<void> {
  await Bun.sleep(10000)

  const maxPolls = 720 // 1 hour max
  for (let i = 0; i < maxPolls; i++) {
    const args = [...atvremoteArgs(atvremote, target), 'playing']
    const result = await exec(args, { captureOutput: true, silent: true })
    if (result.exitCode !== 0) break
    const state = result.stdout.toLowerCase()

    if (state.includes('devicestate: idle') || state.includes('devicestate: stopped'))
      break
    await Bun.sleep(5000)
  }
}
