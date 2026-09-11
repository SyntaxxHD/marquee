import { MarqueeError } from './errors.ts'

export interface ExecOptions {
  cwd?: string
  env?: Record<string, string>
  silent?: boolean
  captureOutput?: boolean
  errorMessage?: string
  inheritStdin?: boolean
  discardOutput?: boolean
  stdinInput?: string
}

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export async function exec(cmd: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  const stdio = opts.silent
    ? (['pipe', 'pipe', 'pipe'] as const)
    : opts.captureOutput
      ? (['pipe', 'pipe', 'pipe'] as const)
      : opts.discardOutput
        ? (['ignore', 'ignore', 'ignore'] as const)
        : (['inherit', 'inherit', 'inherit'] as const)

  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
    stdin: opts.inheritStdin
      ? 'inherit'
      : opts.stdinInput !== undefined
        ? 'pipe'
        : 'ignore',
    stdout: stdio[1],
    stderr: stdio[2]
  })

  if (opts.stdinInput !== undefined) {
    proc.stdin!.write(opts.stdinInput)
    proc.stdin!.end()
  }

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
