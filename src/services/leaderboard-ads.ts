import { join } from 'path'

import { TrailerCache } from '../utils/cache.ts'
import { MarqueeError } from '../utils/errors.ts'
import { downloadVideo } from '../utils/ytdlp.ts'

import type { AdResult } from './ads.ts'

const LEADERBOARD_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  Referer: 'https://business.google.com/'
}

const LANGUAGE_REGION: Record<string, string> = {
  'de-DE': 'de',
  'en-GB': 'gb',
  'en-US': 'us',
  'fr-FR': 'fr',
  'ja-JP': 'jp',
  'pt-PT': 'br'
}

export function regionForLanguage(language: string): string | null {
  return LANGUAGE_REGION[language] ?? null
}

function leaderboardUrl(region: string): string {
  return `https://www.gstatic.com/awmp/data/leaderboard/all_${region}_all_instream.json`
}

export async function leaderboardAdCount(region: string): Promise<number> {
  const res = await fetch(leaderboardUrl(region), { headers: LEADERBOARD_HEADERS })

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as LeaderboardResponse
  return data.Video_List?.length ?? 0
}

interface LeaderboardVideo {
  video_id: string
  video_title: string
  customer_name: string
}

interface LeaderboardResponse {
  Video_List: LeaderboardVideo[]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export class LeaderboardAdService {
  private cache: TrailerCache
  private region: string

  constructor(cacheDir: string, language: string) {
    const region = regionForLanguage(language)
    if (!region) {
      throw new MarqueeError(
        `No ad leaderboard available for language "${language}". Re-run \`marquee setup\` and choose a supported language or local ads.`
      )
    }
    this.region = region
    this.cache = new TrailerCache(cacheDir)
  }

  async init(): Promise<void> {
    await this.cache.init()
  }

  async fetchAds(count: number): Promise<AdResult[]> {
    const videos = await this.fetchLeaderboard()
    const results: AdResult[] = []

    for (const video of shuffle(videos)) {
      if (results.length >= count) break
      try {
        const result = await this.getOrDownload(video)
        results.push(result)
      } catch (err) {
        console.warn(`Skipping ad "${video.video_title}": ${(err as Error).message}`)
      }
    }

    if (results.length < count) {
      throw new MarqueeError(
        `Could only fetch ${results.length} of ${count} ads. Try again later.`
      )
    }

    return results
  }

  private async fetchLeaderboard(): Promise<LeaderboardVideo[]> {
    const url = leaderboardUrl(this.region)

    let res: Response
    try {
      res = await fetch(url, { headers: LEADERBOARD_HEADERS })
    } catch (err) {
      throw new MarqueeError(`Failed to reach ad leaderboard: ${(err as Error).message}`)
    }

    if (!res.ok) {
      throw new MarqueeError(
        `Ad leaderboard unavailable (${res.status} ${res.statusText}) for region "${this.region}".`
      )
    }

    const lastModified = res.headers.get('last-modified') ?? ''
    const data = (await res.json()) as LeaderboardResponse
    const videos = data.Video_List ?? []

    if (videos.length === 0) {
      throw new MarqueeError(`Ad leaderboard for region "${this.region}" is empty.`)
    }

    await this.reconcileFreshness(lastModified, videos)
    return videos
  }

  private async reconcileFreshness(
    lastModified: string,
    videos: LeaderboardVideo[]
  ): Promise<void> {
    const sidecarPath = join(this.cache['cacheDir'], `leaderboard-${this.region}.json`)
    const sidecar = Bun.file(sidecarPath)

    let previous: { lastModified: string } | null = null
    if (await sidecar.exists()) {
      try {
        previous = await sidecar.json()
      } catch {
        previous = null
      }
    }

    if (previous?.lastModified === lastModified) {
      return
    }
    await Bun.write(
      sidecarPath,
      JSON.stringify(
        { region: this.region, lastModified, videoIds: videos.map(v => v.video_id) },
        null,
        2
      )
    )
  }

  private async getOrDownload(video: LeaderboardVideo): Promise<AdResult> {
    const fileName = `${video.video_id}.mp4`
    const cached = await this.cache.get(video.video_id)
    if (cached) {
      return { filePath: cached, fileName }
    }

    const outputPath = join(this.cache['cacheDir'], fileName)
    await downloadVideo(video.video_id, outputPath)

    if (!(await Bun.file(outputPath).exists())) {
      throw new Error('Download completed but output file not found')
    }

    await this.cache.set(video.video_id, outputPath)
    return { filePath: outputPath, fileName }
  }
}
