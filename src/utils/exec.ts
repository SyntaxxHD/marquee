import { MarqueeError } from './errors.ts'
import { logger } from './logger.ts'

export interface ExecOptions {
  cwd?: string
  env?: Record<string, string>
  silent?: boolean
  captureOutput?: boolean
  errorMessage?: string
}

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export async function exec(cmd: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  logger.debug(`exec: ${cmd.join(' ')}`)

  const stdio = opts.silent
    ? (['pipe', 'pipe', 'pipe'] as const)
    : opts.captureOutput
      ? (['pipe', 'pipe', 'pipe'] as const)
      : (['inherit', 'inherit', 'inherit'] as const)

  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
    stdin: 'ignore',
    stdout: stdio[1],
    stderr: stdio[2]
  })

  await proc.exited

  const exitCode = proc.exitCode ?? 1
  let stdout = ''
  let stderr = ''

  if (opts.silent || opts.captureOutput) {
    stdout = await new Response(proc.stdout).text()
    stderr = await new Response(proc.stderr).text()
  }

  return { exitCode, stdout, stderr }
}

export async function execOrThrow(
  cmd: string[],
  opts: ExecOptions = {}
): Promise<ExecResult> {
  const result = await exec(cmd, opts)
  if (result.exitCode !== 0) {
    const msg = opts.errorMessage ?? `Command failed: ${cmd[0]}\n${result.stderr.trim()}`
    throw new MarqueeError(msg)
  }
  return result
}

export async function binaryExists(name: string): Promise<boolean> {
  const result = await exec(['which', name], { silent: true })
  return result.exitCode === 0
}
