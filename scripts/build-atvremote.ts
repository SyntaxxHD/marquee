import { copyFile, chmod, mkdir, rm } from 'fs/promises'
import { join } from 'path'

const ROOT = join(import.meta.dirname, '..')
const VENDOR = join(ROOT, 'vendor')
const IS_WIN = process.platform === 'win32'

// PR #2899: adds the tvOS 26 AirPlay protocol; not yet in a pyatv release.
const PYATV_SOURCE = 'git+https://github.com/postlund/pyatv.git@refs/pull/2899/head'

async function main() {
  await mkdir(VENDOR, { recursive: true })

  console.log(`Installing pyatv from ${PYATV_SOURCE}...`)
  const install = Bun.spawnSync(['pip', 'install', PYATV_SOURCE], {
    stdout: 'inherit',
    stderr: 'inherit'
  })
  if (install.exitCode !== 0) {
    throw new Error('pip install of pyatv failed')
  }

  const entryProc = Bun.spawnSync([
    'python',
    '-c',
    'import pyatv.scripts.atvremote as m; print(m.__file__)'
  ])

  if (entryProc.exitCode !== 0) {
    throw new Error(
      'Could not resolve pyatv after install.\n' + entryProc.stderr.toString()
    )
  }

  const entry = entryProc.stdout.toString().trim()
  console.log(`pyatv entry: ${entry}`)

  const workDir = join(ROOT, '.pyinstaller')
  console.log('Building atvremote with PyInstaller...')

  const build = Bun.spawnSync(
    [
      'pyinstaller',
      '--onefile',
      '--name',
      'atvremote',
      '--collect-all',
      'pyatv',
      '--distpath',
      join(workDir, 'dist'),
      '--workpath',
      join(workDir, 'build'),
      '--specpath',
      workDir,
      entry
    ],
    { stdout: 'inherit', stderr: 'inherit' }
  )

  if (build.exitCode !== 0) {
    throw new Error('PyInstaller build failed')
  }

  const built = join(workDir, 'dist', IS_WIN ? 'atvremote.exe' : 'atvremote')
  const dest = join(VENDOR, 'atvremote')
  await copyFile(built, dest)
  if (!IS_WIN) {
    await chmod(dest, 0o755)
  }

  await rm(workDir, { recursive: true, force: true })

  const size = Bun.file(dest).size
  console.log(`\n✅ atvremote built → vendor/ (${(size / 1024 / 1024).toFixed(1)} MB)`)
}

await main()
