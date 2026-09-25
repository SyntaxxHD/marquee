import { unlink, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

import { loadUserConfig, saveUserConfig } from '../../config.ts'
import type { MarqueeRPC } from '../../shared/rpc-schema.ts'

type _R = MarqueeRPC['bun']['requests']
type _Subset<K extends keyof _R> = {
  [P in K]: (params: _R[P]['params']) => Promise<_R[P]['response']>
}

const AUTOSTART_DIR = join(import.meta.dirname, '../autostart')

async function readTemplate(name: string) {
  return Bun.file(join(AUTOSTART_DIR, name)).text()
}

async function applyMacAutostart(enabled: boolean) {
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.marquee.server.plist')

  if (enabled) {
    const template = await readTemplate('com.marquee.server.plist')
    const args = process.argv[1]
      ? [process.execPath, process.argv[1], '--server']
      : [process.execPath, '--server']
    const argXml = args.map(a => `    <string>${a}</string>`).join('\n')

    await mkdir(dirname(plistPath), { recursive: true })
    await writeFile(plistPath, template.replace('{{PROGRAM_ARGUMENTS}}', argXml))
    await Bun.spawn(['launchctl', 'load', plistPath]).exited
  } else {
    await Bun.spawn(['launchctl', 'unload', plistPath]).exited.catch(() => {})
    await unlink(plistPath).catch(() => {})
  }
}

async function applyLinuxAutostart(enabled: boolean) {
  const serviceDir = join(homedir(), '.config', 'systemd', 'user')
  const servicePath = join(serviceDir, 'marquee.service')

  if (enabled) {
    const template = await readTemplate('marquee.service')
    const execStart = process.argv[1]
      ? `${process.execPath} ${process.argv[1]} --server`
      : `${process.execPath} --server`

    await mkdir(serviceDir, { recursive: true })
    await writeFile(servicePath, template.replace('{{EXEC_START}}', execStart))
    await Bun.spawn(['systemctl', '--user', 'enable', '--now', 'marquee.service']).exited
  } else {
    await Bun.spawn([
      'systemctl',
      '--user',
      'disable',
      '--now',
      'marquee.service'
    ]).exited.catch(() => {})
  }
}

async function applyWindowsAutostart(enabled: boolean) {
  const execStart = process.argv[1]
    ? `${process.execPath} ${process.argv[1]} --server`
    : `${process.execPath} --server`

  if (enabled) {
    await Bun.spawn([
      'reg',
      'add',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      '/v',
      'MarqueeServer',
      '/t',
      'REG_SZ',
      '/d',
      execStart,
      '/f'
    ]).exited
  } else {
    await Bun.spawn([
      'reg',
      'delete',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      '/v',
      'MarqueeServer',
      '/f'
    ]).exited.catch(() => {})
  }
}

export const serverHandlers = {
  enableServerMode: async () => {
    return { url: '' }
  },

  disableServerMode: async () => {
    return undefined
  },

  setAutostart: async ({ enabled }: _R['setAutostart']['params']) => {
    const userConfig = await loadUserConfig()
    await saveUserConfig({
      ...(userConfig ?? {}),
      autostart: enabled
    } as Parameters<typeof saveUserConfig>[0])

    if (process.platform === 'darwin') {
      await applyMacAutostart(enabled)
    } else if (process.platform === 'linux') {
      await applyLinuxAutostart(enabled)
    } else if (process.platform === 'win32') {
      await applyWindowsAutostart(enabled)
    }
  }
} satisfies _Subset<'enableServerMode' | 'disableServerMode' | 'setAutostart'>
