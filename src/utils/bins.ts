import { existsSync } from 'fs'
import { mkdir, chmod } from 'fs/promises'
import { join } from 'path'

import { BIN_CACHE_DIR } from '../config.ts'

export interface Bins {
  ffmpeg: string
  ffprobe: string
  ytDlp: string
  atvremote: string
}

const BIN_CACHE = BIN_CACHE_DIR
const IS_WIN = process.platform === 'win32'

let resolved: Bins | null = null

async function ensureBin(embeddedPath: string, name: string): Promise<string> {
  const fileName = IS_WIN ? `${name}.exe` : name
  const dest = join(BIN_CACHE, fileName)
  if (await Bun.file(dest).exists()) {
    return dest
  }
  await mkdir(BIN_CACHE, { recursive: true })
  await Bun.write(dest, Bun.file(embeddedPath))
  if (!IS_WIN) {
    await chmod(dest, 0o755)
  }
  return dest
}

async function resolveStandalone(): Promise<Bins> {
  const [ff, fp, yt, atv] = await Promise.all([
    import('../../vendor/ffmpeg' as string, { with: { type: 'file' } }),
    import('../../vendor/ffprobe' as string, { with: { type: 'file' } }),
    import('../../vendor/yt-dlp' as string, { with: { type: 'file' } }),
    import('../../vendor/atvremote' as string, { with: { type: 'file' } })
  ])
  return {
    ffmpeg: await ensureBin(ff.default, 'ffmpeg'),
    ffprobe: await ensureBin(fp.default, 'ffprobe'),
    ytDlp: await ensureBin(yt.default, 'yt-dlp'),
    atvremote: await ensureBin(atv.default, 'atvremote')
  }
}

function resolveVendor(): Bins {
  const base = import.meta.dirname
  // When running from project source: src/utils -> ../../vendor
  // When running as Electrobun flat-file bundle: Resources/src/utils -> ../../app/vendor
  const direct = join(base, '..', '..', 'vendor')
  const bundled = join(base, '..', '..', 'app', 'vendor')
  const vendorDir = existsSync(join(direct, IS_WIN ? 'yt-dlp.exe' : 'yt-dlp'))
    ? direct
    : bundled
  return {
    ffmpeg: join(vendorDir, 'ffmpeg'),
    ffprobe: join(vendorDir, 'ffprobe'),
    ytDlp: join(vendorDir, 'yt-dlp'),
    atvremote: join(vendorDir, 'atvremote')
  }
}

export async function resolveBinaries(): Promise<Bins> {
  if (resolved) {
    return resolved
  }

  const isStandalone =
    (Bun as unknown as Record<string, unknown>)['isStandaloneExecutable'] === true
  resolved = isStandalone ? await resolveStandalone() : resolveVendor()
  return resolved
}
