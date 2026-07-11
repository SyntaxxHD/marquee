import { copyFile, chmod, mkdir } from 'fs/promises'
import { join } from 'path'

const ROOT = join(import.meta.dirname, '..')
const VENDOR = join(ROOT, 'vendor')
const IS_WIN = process.platform === 'win32'

async function main() {
  await mkdir(VENDOR, { recursive: true })

  // --- ffmpeg ---
  const ffmpegStatic = (await import('ffmpeg-static')).default
  if (!ffmpegStatic) throw new Error('ffmpeg-static returned null path')

  const ffmpegDest = join(VENDOR, 'ffmpeg')
  console.log(`Copying ffmpeg: ${ffmpegStatic} → ${ffmpegDest}`)

  await copyFile(ffmpegStatic, ffmpegDest)

  if (!IS_WIN) await chmod(ffmpegDest, 0o755)

  // --- ffprobe ---
  const ffprobeInstaller = await import('@ffprobe-installer/ffprobe')
  const ffprobeSrc = ffprobeInstaller.path
  const ffprobeDest = join(VENDOR, 'ffprobe')
  console.log(`Copying ffprobe: ${ffprobeSrc} → ${ffprobeDest}`)

  await copyFile(ffprobeSrc, ffprobeDest)

  if (!IS_WIN) await chmod(ffprobeDest, 0o755)

  // --- yt-dlp ---
  const ytDlpDest = join(VENDOR, 'yt-dlp')
  const ytDlpUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytDlpAsset()}`
  console.log(`Downloading yt-dlp: ${ytDlpUrl} → ${ytDlpDest}`)

  const res = await fetch(ytDlpUrl)
  if (!res.ok) {
    throw new Error(
      `Failed to download yt-dlp (${res.status} ${res.statusText}): ${ytDlpUrl}`
    )
  }
  await Bun.write(ytDlpDest, res)

  if (!IS_WIN) await chmod(ytDlpDest, 0o755)

  console.log('\n✅ vendor/ populated successfully')
  console.log('   Contents:')

  for (const f of ['ffmpeg', 'ffprobe', 'yt-dlp'].map(n => join(VENDOR, n))) {
    const size = Bun.file(f).size
    console.log(
      `   ${f.replace(VENDOR + '/', '')} (${(size / 1024 / 1024).toFixed(1)} MB)`
    )
  }
}

function ytDlpAsset(): string {
  switch (process.platform) {
    case 'linux':
      return 'yt-dlp_linux'
    case 'darwin':
      return 'yt-dlp_macos'
    case 'win32':
      return 'yt-dlp.exe'
    default:
      throw new Error(`Unsupported platform for yt-dlp: ${process.platform}`)
  }
}

await main()
