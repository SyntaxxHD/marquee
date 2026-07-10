import chalk from 'chalk'
import prompts from 'prompts'

import { saveUserConfig } from '../config.ts'
import type { UserConfig, OutputResolution, OutputFps } from '../config.ts'
import { discoverBridges, createHueUser, listHueLights } from '../services/hue.ts'
import { discoverAppleTVs, pairAppleTV } from '../services/player.ts'
import { MarqueeError } from '../utils/errors.ts'
import { logger } from '../utils/logger.ts'

const QUALITY_OPTIONS = [
  { title: '1080p 25fps  (HD PAL — recommended for most TVs)', value: '1920x1080@25' },
  { title: '1080p 60fps  (HD smooth)', value: '1920x1080@60' },
  { title: '4K 60fps     (UHD — slow to encode)', value: '3840x2160@60' }
]

const LANGUAGE_OPTIONS = [
  { title: '🇩🇪 Deutsch', value: 'de-DE' },
  { title: '🇬🇧 English', value: 'en-GB' },
  { title: '🇪🇸 Español', value: 'es-ES' },
  { title: '🇫🇷 Français', value: 'fr-FR' },
  { title: '🇮🇹 Italiano', value: 'it-IT' },
  { title: '🇵🇹 Português', value: 'pt-PT' },
  { title: '🇳🇱 Nederlands', value: 'nl-NL' },
  { title: '🇯🇵 日本語', value: 'ja-JP' }
]

export async function runSetup(): Promise<void> {
  console.log(chalk.bold.cyan('\n🎬 marquee — setup wizard\n'))

  const appleTV = await setupAppleTV()

  const qualityRes = await prompts({
    type: 'select',
    name: 'quality',
    message: 'Output video quality:',
    choices: QUALITY_OPTIONS
  })

  if (!qualityRes.quality) throw new MarqueeError('Setup cancelled.')

  const [resolution, fps] = qualityRes.quality.split('@')
  const outputResolution = resolution as OutputResolution
  const outputFps = Number(fps) as OutputFps

  const languageRes = await prompts({
    type: 'select',
    name: 'language',
    message: 'Trailer language:',
    choices: LANGUAGE_OPTIONS,
    initial: 0
  })

  if (!languageRes.language) throw new MarqueeError('Setup cancelled.')

  const language = languageRes.language as string

  const hueRes = await prompts({
    type: 'confirm',
    name: 'setupHue',
    message: 'Set up Philips Hue lighting automation?',
    initial: true
  })

  let hue: UserConfig['hue'] = null

  if (hueRes.setupHue) {
    hue = await setupHue()
  }

  const config: UserConfig = { appleTV, language, outputResolution, outputFps, hue }
  await saveUserConfig(config)

  console.log()
  logger.success('Setup complete! Run `marquee run` to start the pre-show.')
  console.log()
}

async function setupAppleTV(): Promise<UserConfig['appleTV']> {
  console.log(chalk.dim('Scanning for Apple TV devices on your network (5s)...'))
  const devices = await discoverAppleTVs(5000)

  let selectedId: string
  let selectedName: string

  if (devices.length === 0) {
    logger.warn('No Apple TV devices found via mDNS.')

    const res = await prompts({
      type: 'text',
      name: 'ip',
      message: 'Enter your Apple TV IP address manually:',
      validate: v => /^\d+\.\d+\.\d+\.\d+$/.test(v.trim()) || 'Enter a valid IPv4 address'
    })

    if (!res.ip) throw new MarqueeError('Setup cancelled.')

    selectedId = res.ip.trim()
    selectedName = `Apple TV (${selectedId})`
  } else {
    const res = await prompts({
      type: 'select',
      name: 'device',
      message: 'Which Apple TV should marquee use?',
      choices: devices.map(d => ({ title: `${d.name}  (${d.ip})`, value: d.ip }))
    })

    if (!res.device) throw new MarqueeError('Setup cancelled.')

    selectedId = res.device
    selectedName = devices.find(d => d.ip === selectedId)?.name ?? selectedId
  }

  console.log(chalk.dim('\nStarting AirPlay pairing...'))
  console.log(chalk.yellow('  A PIN will appear on your TV. Enter it when prompted.'))

  await pairAppleTV(selectedId)
  logger.success(`Paired with ${selectedName}`)

  return { name: selectedName, id: selectedId }
}

async function setupHue(): Promise<UserConfig['hue']> {
  console.log(chalk.dim('\nDiscovering Hue bridges on your network...'))
  const bridges = await discoverBridges()

  if (bridges.length === 0) {
    logger.warn('No Hue bridges found. Skipping Hue setup.')
    return null
  }

  let bridgeIp: string

  if (bridges.length === 1) {
    bridgeIp = bridges[0].ipaddress
    console.log(chalk.green(`  Found bridge at ${bridgeIp}`))
  } else {
    const res = await prompts({
      type: 'select',
      name: 'bridge',
      message: 'Multiple bridges found. Which one should marquee use?',
      choices: bridges.map(b => ({ title: b.ipaddress, value: b.ipaddress }))
    })
    if (!res.bridge) throw new MarqueeError('Setup cancelled.')
    bridgeIp = res.bridge
  }

  await prompts({
    type: 'confirm',
    name: 'ready',
    message: chalk.yellow('Press the button on your Hue bridge, then press Enter here.'),
    initial: true
  })

  console.log(chalk.dim('  Registering with bridge...'))
  const username = await createHueUser(bridgeIp)
  logger.success(`Registered with Hue bridge (${bridgeIp})`)

  console.log(chalk.dim('  Loading lights...'))
  const lights = await listHueLights(bridgeIp, username)

  if (lights.length === 0) {
    logger.warn('No lights found on this bridge. Skipping light selection.')
    return { bridgeIp, username, controlledLightIds: [] }
  }

  const lightRes = await prompts({
    type: 'multiselect',
    name: 'lights',
    message: 'Which lights should marquee control?',
    choices: lights.map(l => ({ title: l.name, value: l.id, selected: true })),
    min: 1,
    hint: 'Space to toggle, Enter to confirm'
  })

  if (!lightRes.lights || lightRes.lights.length === 0) {
    throw new MarqueeError('No lights selected. Setup cancelled.')
  }

  return { bridgeIp, username, controlledLightIds: lightRes.lights }
}
