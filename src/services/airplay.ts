import { MarqueeError } from '../utils/errors.ts'
import { exec } from '../utils/exec.ts'

function escapeAppleScriptPath(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function osascript(script: string): Promise<string> {
  const result = await exec(['osascript', '-e', script], { captureOutput: true })
  if (result.exitCode !== 0) {
    throw new MarqueeError(`osascript failed: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

export async function listAirPlayDevices(): Promise<string[]> {
  const script = `
    tell application "System Events"
      tell process "ControlCenter"
        set menuItem to menu bar item "AirPlay Display" of menu bar 1
        click menuItem
        set deviceNames to {}
        repeat with item in menu items of menu 1 of menuItem
          set itemName to name of item
          if itemName is not "" and itemName is not "AirPlay Display" then
            set end of deviceNames to itemName
          end if
        end repeat
        key code 53
        return deviceNames
      end tell
    end tell
  `
  try {
    const raw = await osascript(script)
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function playInQuickTime(
  filePath: string,
  deviceName: string,
  signal?: AbortSignal
): Promise<void> {
  const result = await exec(['which', 'osascript'], { silent: true })
  if (result.exitCode !== 0) {
    throw new MarqueeError('osascript not found. This command requires macOS.')
  }

  await osascript('tell application "QuickTime Player" to quit').catch(() => {})
  await Bun.sleep(1500)

  const safePath = escapeAppleScriptPath(filePath)
  const safeDevice = deviceName.replace(/"/g, '\\"')

  const openScript = `
    tell application "QuickTime Player"
      activate
      open POSIX file "${safePath}"
      delay 2
      tell document 1
        present
      end tell
    end tell
  `
  await osascript(openScript)

  const airplayScript = `
    tell application "System Events"
      tell process "QuickTime Player"
        try
          click menu item "${safeDevice}" of menu "AirPlay" of menu bar 1
        on error
        end try
      end tell
    end tell
  `
  await exec(['osascript', '-e', airplayScript], { captureOutput: true })

  console.log(`Playing on ${deviceName}`)

  const waitAndQuit = `
    tell application "QuickTime Player"
      try
        delay (duration of document 1)
      end try
      quit
    end tell
  `

  const proc = Bun.spawn(['osascript', '-e', waitAndQuit], {
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit'
  })

  const onAbort = () => {
    proc.kill()
    osascript('tell application "QuickTime Player" to quit').catch(() => {})
  }

  signal?.addEventListener('abort', onAbort, { once: true })
  await proc.exited
  signal?.removeEventListener('abort', onAbort)

  if (signal?.aborted) {
    throw new Error('Cancelled')
  }

  if ((proc.exitCode ?? 1) !== 0) {
    throw new MarqueeError('Failed waiting for QuickTime playback to finish')
  }
}
