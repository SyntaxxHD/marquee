import chalk from 'chalk'

import { runCheck } from './commands/check.ts'
import { runRun } from './commands/run.ts'
import { runSetup } from './commands/setup.ts'
import { runStream } from './commands/stream.ts'
import { loadUserConfig } from './config.ts'
import { MarqueeError } from './utils/errors.ts'
import { logger } from './utils/logger.ts'
import { cleanupTmpDir } from './utils/tmp.ts'

function printHelp(): void {
  console.log(chalk.bold.cyan('\n🎬 marquee - cinema pre-show assembler\n'))
  console.log(
    '  ' + chalk.bold('marquee setup') + '         Interactive first-time configuration'
  )
  console.log('  ' + chalk.bold('marquee run') + '           Build and play the pre-show')
  console.log(
    '  ' + chalk.bold('marquee stream <file>') + ' Play an already-built pre-show file'
  )
  console.log(
    '  ' +
      chalk.bold('marquee check') +
      '         Validate dependencies and configuration'
  )
  console.log()
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const [command, ...rest] = args

  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command !== 'setup') {
    const userConfig = await loadUserConfig()
    if (!userConfig) {
      logger.info('No configuration found. Starting setup first...\n')
      await runSetup()
    }
  }

  switch (command) {
    case 'setup':
      await runSetup()
      break
    case 'run':
      await runRun()
      break
    case 'stream':
      await runStream(rest[0])
      break
    case 'check':
      await runCheck()
      break
    default:
      logger.error(`Unknown command: ${command}`)
      printHelp()
      process.exit(1)
  }
}

process.on('SIGINT', async () => {
  console.log()
  logger.warn('Interrupted. Cleaning up...')
  await cleanupTmpDir()
  process.exit(130)
})

process.on('SIGTERM', async () => {
  await cleanupTmpDir()
  process.exit(143)
})

main().catch(async err => {
  await cleanupTmpDir()
  if (err instanceof MarqueeError) {
    logger.error(err.message)
  } else {
    logger.error('Unexpected error:')
    console.error(err)
  }
  process.exit(1)
})
