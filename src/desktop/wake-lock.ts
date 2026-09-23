let wakeLockProc: { kill: () => void } | null = null

export function startWakeLock() {
  if (wakeLockProc) {
    return
  }

  if (process.platform === 'darwin') {
    wakeLockProc = Bun.spawn(['caffeinate', '-i', '-s'], {
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore'
    })
  } else if (process.platform === 'linux') {
    wakeLockProc = Bun.spawn(
      [
        'systemd-inhibit',
        '--what=idle:sleep',
        '--who=Marquee',
        '--why=Preshow running',
        '--mode=block',
        'sleep',
        'infinity'
      ],
      { stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' }
    )
  } else if (process.platform === 'win32') {
    wakeLockProc = Bun.spawn(
      [
        'powershell',
        '-NoProfile',
        '-Command',
        'Add-Type -MemberDefinition \'[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);\' -Name K -Namespace W; [W.K]::SetThreadExecutionState(0x80000003); Read-Host'
      ],
      { stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' }
    )
  }
}

export function stopWakeLock() {
  wakeLockProc?.kill()
  wakeLockProc = null
}
