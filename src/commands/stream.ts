import { loadConfig } from '../config.ts'
import { HueClient } from '../services/hue.ts'
import { playFile } from '../services/player.ts'
import { MarqueeError } from '../utils/errors.ts'
import { logger } from '../utils/logger.ts'

export async function runStream(filePath?: string): Promise<void> {
  const config = await loadConfig()
  const path = filePath?.trim()
  if (!path) throw new MarqueeError('Usage: marquee stream <file>')

  if (!(await Bun.file(path).exists())) {
    throw new MarqueeError(`File not found: ${path}`)
  }

  const hue = config.hue ? new HueClient(config.hue.bridgeIp, config.hue.username) : null
  const lightIds = config.hue?.controlledLightIds ?? []
  const dimPercent = config.hue?.dimPercent ?? 30

  if (hue) {
    logger.info(`💡 Lights → dim (${dimPercent}%)`)
    await hue.dimLights(lightIds, dimPercent)
  }

  try {
    if (!config.appleTV)
      throw new MarqueeError('No Apple TV configured. Run marquee setup.')
    await playFile(path, config.appleTV)
  } finally {
    if (hue) {
      logger.info('💡 Lights → off')
      await hue.turnLightsOff(lightIds)
    }
  }
}
