import chalk from 'chalk'
import prompts from 'prompts'

import { loadUserConfig, saveUserConfig } from '../config.ts'
import type {
  UserConfig,
  OutputResolution,
  OutputFps,
  AdSource,
  TrailerSource
} from '../config.ts'
import {
  discoverBridges,
  createHueUser,
  listHueLights,
  validateHueConnection
} from '../services/hue.ts'
import {
  discoverAppleTVs,
  pairAppleTV,
  resolveTarget,
  probeAppleTV
} from '../services/player.ts'
import { TmdbClient } from '../services/tmdb.ts'
import { MarqueeError } from '../utils/errors.ts'
import { logger } from '../utils/logger.ts'

const QUALITY_OPTIONS = [
  { title: '1080p 25fps (HD PAL, recommended for most TVs)', value: '1920x1080@25' },
  { title: '1080p 60fps (HD smooth)', value: '1920x1080@60' },
  { title: '4K 60fps (UHD, slow to encode)', value: '3840x2160@60' }
]

const LANGUAGE_OPTIONS = [
  { title: 'Deutsch', value: 'de-DE' },
  { title: 'English', value: 'en-GB' },
  { title: 'Français', value: 'fr-FR' },
  { title: 'Português', value: 'pt-PT' },
  { title: '日本語', value: 'ja-JP' }
]

export async function runSetup(): Promise<void> {
  console.log(chalk.bold.cyan('\n🎬 marquee setup wizard\n'))

  const existing = await loadUserConfig()

  const adSourceRes = await prompts({
    type: 'select',
    name: 'adSource',
    message: 'Where should ads come from?',
    choices: [
      {
        title: '🌐 Automatic (top YouTube ads for your region)',
        value: 'auto'
      },
      { title: '📁 Local folder (your own ad videos)', value: 'local' }
    ]
  })

  if (!adSourceRes.adSource) throw new MarqueeError('Setup cancelled.')

  const adSource = adSourceRes.adSource as AdSource

  let adsDir = './ads'
  if (adSource === 'local') {
    const adsRes = await prompts({
      type: 'text',
      name: 'adsDir',
      message: 'Folder containing your ad videos:',
      initial: './ads'
    })
    if (!adsRes.adsDir) throw new MarqueeError('Setup cancelled.')
    adsDir = (adsRes.adsDir as string).trim()
  }

  const trailerSourceRes = await prompts({
    type: 'select',
    name: 'trailerSource',
    message: 'Where should trailers come from?',
    choices: [
      {
        title: '🌐 Automatic (fresh movie trailers via TMDB)',
        value: 'auto'
      },
      { title: '📁 Local folder (your own trailer videos)', value: 'local' }
    ]
  })

  if (!trailerSourceRes.trailerSource) throw new MarqueeError('Setup cancelled.')

  const trailerSource = trailerSourceRes.trailerSource as TrailerSource

  let trailersDir = './trailers'
  if (trailerSource === 'local') {
    const trailersRes = await prompts({
      type: 'text',
      name: 'trailersDir',
      message: 'Folder containing your trailer videos:',
      initial: './trailers'
    })
    if (!trailersRes.trailersDir) throw new MarqueeError('Setup cancelled.')
    trailersDir = (trailersRes.trailersDir as string).trim()
  }

  const tmdbApiKey = trailerSource === 'auto' ? await setupTmdb(existing?.tmdbApiKey) : ''

  const appleTV = await setupAppleTV(existing?.appleTV ?? null)

  const qualityValue = existing
    ? `${existing.outputResolution}@${existing.outputFps}`
    : undefined
  const qualityRes = await prompts({
    type: 'select',
    name: 'quality',
    message: 'Output video quality:',
    choices: QUALITY_OPTIONS,
    initial: Math.max(
      0,
      QUALITY_OPTIONS.findIndex(o => o.value === qualityValue)
    )
  })

  if (!qualityRes.quality) throw new MarqueeError('Setup cancelled.')

  const [resolution, fps] = qualityRes.quality.split('@')
  const outputResolution = resolution as OutputResolution
  const outputFps = Number(fps) as OutputFps

  const languageRes = await prompts({
    type: 'select',
    name: 'language',
    message: 'Language (for trailers and automatic ads):',
    choices: LANGUAGE_OPTIONS,
    initial: Math.max(
      0,
      LANGUAGE_OPTIONS.findIndex(o => o.value === existing?.language)
    )
  })

  if (!languageRes.language) throw new MarqueeError('Setup cancelled.')

  const language = languageRes.language as string

  const countRes = await prompts([
    {
      type: 'number',
      name: 'adCount',
      message: 'How many ads per pre-show?',
      initial: existing?.adCount ?? 4,
      min: 1,
      max: 20
    },
    {
      type: 'number',
      name: 'trailerCount',
      message: 'How many trailers per pre-show?',
      initial: existing?.trailerCount ?? 3,
      min: 1,
      max: 20
    }
  ])

  if (countRes.adCount === undefined || countRes.trailerCount === undefined) {
    throw new MarqueeError('Setup cancelled.')
  }

  const adCount = countRes.adCount as number
  const trailerCount = countRes.trailerCount as number

  const hueRes = await prompts({
    type: 'confirm',
    name: 'setupHue',
    message: 'Set up Philips Hue lighting automation?',
    initial: true
  })

  let hue: UserConfig['hue'] = null

  if (hueRes.setupHue) {
    hue = await setupHue(existing?.hue ?? null)
  }

  const config: UserConfig = {
    tmdbApiKey,
    adSource,
    adsDir,
    adCount,
    trailerSource,
    trailersDir,
    trailerCount,
    appleTV,
    language,
    outputResolution,
    outputFps,
    hue
  }
  await saveUserConfig(config)

  console.log()
  logger.success('Setup complete! Run `marquee run` to start the pre-show.')
  console.log()
}

async function setupTmdb(existingKey?: string): Promise<string> {
  if (existingKey) {
    console.log(chalk.dim('Checking saved TMDB API key...'))
    if (await new TmdbClient(existingKey, 'en-US').validateApiKey()) {
      logger.success('TMDB key still valid')
      return existingKey
    }
    logger.warn('Saved TMDB key no longer works. Please enter a new one.')
  }

  console.log(
    chalk.dim('Get a free API key at https://www.themoviedb.org/settings/api\n')
  )

  for (;;) {
    const res = await prompts({
      type: 'password',
      name: 'key',
      message: 'TMDB API key:',
      validate: v => v.trim().length > 0 || 'API key cannot be empty'
    })

    if (!res.key) throw new MarqueeError('Setup cancelled.')

    const key = (res.key as string).trim()

    console.log(chalk.dim('Validating key...'))
    const valid = await new TmdbClient(key, 'en-US').validateApiKey()
    if (valid) {
      logger.success('TMDB key valid')
      return key
    }

    logger.warn('That key was rejected by TMDB. Please try again.')
  }
}

async function setupAppleTV(
  existing: UserConfig['appleTV']
): Promise<UserConfig['appleTV']> {
  if (existing) {
    console.log(chalk.dim(`Checking saved Apple TV (${existing.name})...`))
    if (await probeAppleTV(existing)) {
      logger.success(`Apple TV still paired (${existing.name})`)
      return existing
    }
    logger.warn('Saved Apple TV pairing no longer works. Re-pairing needed.')
  }

  let selectedAddress: string
  let selectedName: string

  for (;;) {
    console.log(chalk.dim('Scanning for Apple TV devices on your network (5s)...'))
    const devices = await discoverAppleTVs(5000)

    if (devices.length === 0) {
      logger.warn('No Apple TV devices found.')
    }

    const choices = [
      ...devices.map(d => ({ title: `📺 ${d.name}  (${d.ip})`, value: d.ip })),
      { title: '🔄 Rescan', value: '__rescan__' },
      { title: '⌨️  Enter IP address manually', value: '__manual__' }
    ]

    const res = await prompts({
      type: 'select',
      name: 'choice',
      message: 'Which Apple TV should marquee use?',
      choices
    })

    if (!res.choice) throw new MarqueeError('Setup cancelled.')

    if (res.choice === '__rescan__') {
      continue
    }

    if (res.choice === '__manual__') {
      const manual = await prompts({
        type: 'text',
        name: 'ip',
        message: 'Enter your Apple TV IP address:',
        validate: v =>
          /^\d+\.\d+\.\d+\.\d+$/.test(v.trim()) || 'Enter a valid IPv4 address'
      })

      if (!manual.ip) throw new MarqueeError('Setup cancelled.')

      selectedAddress = (manual.ip as string).trim()
      selectedName = `Apple TV (${selectedAddress})`
      break
    }

    selectedAddress = res.choice
    selectedName = devices.find(d => d.ip === selectedAddress)?.name ?? selectedAddress
    break
  }

  console.log(chalk.dim('\nResolving device...'))
  const target = await resolveTarget(selectedName, selectedAddress)

  await pairAppleTV(target)
  logger.success(`Paired with ${target.name}`)

  return target
}

async function setupHue(existing: UserConfig['hue']): Promise<UserConfig['hue']> {
  let bridgeIp: string
  let username: string

  const reuse =
    existing && (await validateHueConnection(existing.bridgeIp, existing.username))

  if (reuse) {
    logger.success(`Hue bridge still connected (${existing.bridgeIp})`)
    bridgeIp = existing.bridgeIp
    username = existing.username
  } else {
    if (existing) {
      logger.warn('Saved Hue registration no longer works. Re-registering needed.')
    }

    console.log(chalk.dim('\nDiscovering Hue bridges on your network...'))
    const bridges = await discoverBridges()

    if (bridges.length === 0) {
      logger.warn('No Hue bridges found. Skipping Hue setup.')
      return null
    }

    if (bridges.length === 1) {
      bridgeIp = bridges[0].ipaddress
      console.log(chalk.green(`Found bridge at ${bridgeIp}`))
    } else {
      const res = await prompts({
        type: 'select',
        name: 'bridge',
        message: 'Multiple bridges found. Which one should marquee use?',
        choices: bridges.map(b => ({ title: `🌉 ${b.ipaddress}`, value: b.ipaddress }))
      })
      if (!res.bridge) throw new MarqueeError('Setup cancelled.')
      bridgeIp = res.bridge
    }

    console.log(chalk.yellow('Press the button on top of your Hue bridge now...'))

    let announced = false
    username = await createHueUser(bridgeIp, {
      onWaiting: () => {
        if (!announced) {
          console.log(chalk.dim('Waiting for the button press...'))
          announced = true
        }
      }
    })
    logger.success(`Registered with Hue bridge (${bridgeIp})`)
  }

  console.log(chalk.dim('Loading lights...'))
  const lights = await listHueLights(bridgeIp, username)

  if (lights.length === 0) {
    logger.warn('No lights found on this bridge. Skipping light selection.')
    return {
      bridgeIp,
      username,
      controlledLightIds: [],
      dimPercent: existing?.dimPercent ?? 30
    }
  }

  const previous = existing?.controlledLightIds
  const lightRes = await prompts({
    type: 'multiselect',
    name: 'lights',
    message: 'Which lights should marquee control?',
    choices: lights.map(l => ({
      title: `💡 ${l.name}`,
      value: l.id,
      selected: previous ? previous.includes(l.id) : true
    })),
    min: 1,
    instructions: false,
    hint: 'Space to select, Enter to confirm'
  })

  if (!lightRes.lights || lightRes.lights.length === 0) {
    throw new MarqueeError('No lights selected. Setup cancelled.')
  }

  const dimRes = await prompts({
    type: 'number',
    name: 'dimPercent',
    message: 'Dim to what brightness while the pre-show plays? (%)',
    initial: existing?.dimPercent ?? 30,
    min: 1,
    max: 100
  })

  if (dimRes.dimPercent === undefined) throw new MarqueeError('Setup cancelled.')

  return {
    bridgeIp,
    username,
    controlledLightIds: lightRes.lights,
    dimPercent: dimRes.dimPercent as number
  }
}
