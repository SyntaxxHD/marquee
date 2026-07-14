import chalk from 'chalk'
import cliProgress from 'cli-progress'

import { logger } from './logger.ts'

const isTty = Boolean(process.stdout.isTTY)

export interface ProgressBar {
  update(percent: number): void
  finish(): void
}

interface ProgressOptions {
  step: string
  label: string
}

export function createProgressBar(opts: ProgressOptions): ProgressBar {
  const prefix = chalk.cyan(`  ${opts.step}`)
  const label = opts.label

  if (!isTty) {
    logger.step(0, 0, `${label}...`)
    return {
      update() {},
      finish() {}
    }
  }

  const bar = new cliProgress.SingleBar(
    {
      format: `${prefix} ${label} {bar} {percentage}%`,
      barCompleteChar: '━',
      barIncompleteChar: '─',
      barsize: 24,
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: true,
      linewrap: false
    },
    cliProgress.Presets.shades_classic
  )

  bar.start(100, 0)

  return {
    update(percent) {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)))
      bar.update(clamped)
    },
    finish() {
      bar.update(100)
      bar.stop()
    }
  }
}
