import chalk from 'chalk'

const isDebug = process.env.DEBUG === '1'

export const logger = {
  info(msg: string) {
    console.log(chalk.blue(`ℹ  ${msg}`))
  },
  success(msg: string) {
    console.log(chalk.green(`✅ ${msg}`))
  },
  warn(msg: string) {
    console.warn(chalk.yellow(`⚠️  ${msg}`))
  },
  error(msg: string) {
    console.error(chalk.red(`❌ ${msg}`))
  },
  debug(msg: string) {
    if (isDebug) console.log(chalk.gray(`🔍 ${msg}`))
  },
  step(n: number, total: number, msg: string) {
    console.log(chalk.cyan(`  [${n}/${total}] ✨ ${msg}`))
  }
}
