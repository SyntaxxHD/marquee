# 🎬 marquee

Your own cinema pre-show. `marquee` builds a reel of ads and fresh movie trailers, streams it to your Apple TV over AirPlay, and dims your Philips Hue lights as the show begins — just like the theater, right before your movie starts.

## ✨ What it does

1. 💡 Turns your lights to a warm, bright glow
2. 📦 Picks a few random ads from your local folder
3. 🎥 Downloads fresh German movie trailers (via [TMDB](https://www.themoviedb.org/))
4. ✂️ Splices everything into one seamless video
5. ▶️ Streams it to your Apple TV, dims the lights, and when it ends, turns them off so your movie can start

## 📥 Install

Download the binary for your platform from the [latest release](../../releases/latest):

| Platform              | File                      |
| --------------------- | ------------------------- |
| macOS (Apple Silicon) | `marquee-macos-arm64`     |
| Linux                 | `marquee-linux-x64`       |
| Windows               | `marquee-windows-x64.exe` |

## 🚀 Getting started

**1. Add your ads.** Drop a handful of video files (`.mp4`, `.mov`, `.mkv`, `.avi`) into an `ads/` folder.

**2. Set your TMDB key.** Create a `.env` file next to the binary:

```
TMDB_API_KEY=your_key_here
ADS_DIR=./ads
OUTPUT_DIR=./output
```

Get a free API key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).

**3. Run it.**

```bash
marquee run
```

The first run walks you through setup — it finds your Apple TV, pairs with it (enter the PIN shown on your TV), and optionally connects your Hue bridge and lights.

## 🕹️ Commands

| Command                 | What it does                                  |
| ----------------------- | --------------------------------------------- |
| `marquee run`           | The full show: build the reel and stream it   |
| `marquee build`         | Build the reel only (no playback)             |
| `marquee stream <file>` | Play an already-built video                   |
| `marquee setup`         | Re-run the setup wizard                       |
| `marquee check`         | Verify everything is configured and reachable |

## 🛠️ Development

Built with [Bun](https://bun.sh) + TypeScript.

```bash
bun install
bun run download-bins # fetch ffmpeg, ffprobe, yt-dlp into vendor/
bun run scripts/build-atvremote.ts # build atvremote
bun run start <command> # run from source
bun run build:binary # compile a standalone binary
```
