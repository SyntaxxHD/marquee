import prompts from 'prompts'

import { loadConfig } from '../config.ts'
import { HueClient } from '../services/hue.ts'
import { playFile } from '../services/player.ts'
import { logger } from '../utils/logger.ts'
import { cleanupTmpDir } from '../utils/tmp.ts'

import { runBuild } from './build.ts'

export async function runRun(): Promise<void> {
  const config = await loadConfig()
  const hue = config.hue ? new HueClient(config.hue.bridgeIp, config.hue.username) : null
  const lightIds = config.hue?.controlledLightIds ?? []
  const dimPercent = config.hue?.dimPercent ?? 30

  if (hue) {
    logger.info('💡 Lights → bright')
    await hue.setLightsNormal(lightIds)
  }

  const { outputPath } = await runBuild()

  const { start } = await prompts({
    type: 'confirm',
    name: 'start',
    message: 'Pre-show ready. Start now?',
    initial: true
  })

  if (!start) {
    logger.info('Cancelled before playback.')
    if (hue) await hue.turnLightsOff(lightIds)
    await cleanupTmpDir()
    return
  }

  if (hue) {
    logger.info(`💡 Lights → dim (${dimPercent}%)`)
    await hue.dimLights(lightIds, dimPercent)
  }

  try {
    if (!config.appleTV) throw new Error('No Apple TV configured. Run marquee setup.')
    await playFile(outputPath, config.appleTV)
  } finally {
    if (hue) {
      logger.info('💡 Lights → off')
      await hue.turnLightsOff(lightIds)
    }
    await cleanupTmpDir()
  }
}
