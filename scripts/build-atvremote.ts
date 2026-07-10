/**
 * Builds the atvremote (pyatv) CLI as a standalone binary via PyInstaller and drops it
 * into vendor/. pyatv ships no official standalone binary, so we build it ourselves.
 * Shared recipe for local dev and CI (release.yml runs the same steps).
 *
 * Requires: python 3, pip install pyatv pyinstaller
 * Run: bun run scripts/build-atvremote.ts
 */
import { copyFile, chmod, mkdir, rm } from 'fs/promises'
import { join } from 'path'

const ROOT = join(import.meta.dirname, '..')
const VENDOR = join(ROOT, 'vendor')
const IS_WIN = process.platform === 'win32'

async function main() {
  await mkdir(VENDOR, { recursive: true })

  const entryProc = Bun.spawnSync([
    'python',
    '-c',
    'import pyatv.scripts.atvremote as m; print(m.__file__)'
  ])
  if (entryProc.exitCode !== 0) {
    throw new Error(
      'Could not resolve pyatv. Install it first: pip install pyatv pyinstaller\n' +
        entryProc.stderr.toString()
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
  if (build.exitCode !== 0) throw new Error('PyInstaller build failed')

  const built = join(workDir, 'dist', IS_WIN ? 'atvremote.exe' : 'atvremote')
  const dest = join(VENDOR, 'atvremote')
  await copyFile(built, dest)
  if (!IS_WIN) await chmod(dest, 0o755)

  await rm(workDir, { recursive: true, force: true })

  const size = Bun.file(dest).size
  console.log(`\n✅ atvremote built → vendor/ (${(size / 1024 / 1024).toFixed(1)} MB)`)
}

await main()
