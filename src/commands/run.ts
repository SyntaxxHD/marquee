import { loadConfig } from '../config.ts'
import { HueClient } from '../services/hue.ts'
import { playFile } from '../services/player.ts'
import { logger } from '../utils/logger.ts'

import { runBuild } from './build.ts'

export async function runRun(): Promise<void> {
  const config = await loadConfig()
  const hue = config.hue ? new HueClient(config.hue.bridgeIp, config.hue.username) : null
  const lightIds = config.hue?.controlledLightIds ?? []

  if (hue) {
    logger.info('💡 Lights → bright')
    await hue.setLightsNormal(lightIds)
  }

  const { outputPath } = await runBuild()

  if (hue) {
    logger.info('💡 Lights → dim')
    await hue.dimLights(lightIds)
  }

  try {
    if (!config.appleTV) throw new Error('No Apple TV configured. Run marquee setup.')
    await playFile(outputPath, config.appleTV)
  } finally {
    if (hue) {
      logger.info('💡 Lights → off')
      await hue.turnLightsOff(lightIds)
    }
  }
}
