# 🎬 marquee

Your own cinema pre-show. `marquee` builds a reel of ads and movie trailers, streams it to your Apple TV over AirPlay, and dims your Philips Hue lights as the show begins, just like the theater right before your movie starts.

## ✨ What it does

1. Turns your lights to a warm, bright glow
2. Grabs a few ads, either the current top YouTube ads for your region or your own local folder
3. Adds movie trailers, either fresh ones via [TMDB](https://www.themoviedb.org/) or your own local folder
4. Splices everything into one seamless video
5. Streams it to your Apple TV, dims the lights, and when it ends, turns them off so your movie can start

## 📥 Install

Download the binary for your platform from the [latest release](../../releases/latest):

| Platform              | File                      |
| --------------------- | ------------------------- |
| macOS (Apple Silicon) | `marquee-macos-arm64`     |
| Linux                 | `marquee-linux-x64`       |
| Windows               | `marquee-windows-x64.exe` |

## 🚀 Getting started

**1. Choose your sources.** During setup you pick where ads and trailers come from, each independently:

- **Automatic ads** pull the current top YouTube ads for your region. **Local ads** use your own videos from a folder.
- **Automatic trailers** fetch fresh movie trailers via TMDB (needs a free API key, setup will ask). **Local trailers** use your own videos from a folder.

**2. Run it.**

```bash
marquee run
```

The first run walks you through setup: it asks for your ad and trailer sources (plus a TMDB key if trailers are automatic), finds your Apple TV and pairs with it (enter the PIN shown on your TV), lets you pick your language/region and output quality, and optionally connects your Hue bridge and lights. Everything is saved to `~/.config/marquee/config.json`. Re-run `marquee setup` any time to change it.

The assembled video is temporary. It streams to your Apple TV and is cleaned up afterward, so there is nothing to manage on disk.

## 🕹️ Commands

| Command                 | What it does                                  |
| ----------------------- | --------------------------------------------- |
| `marquee run`           | Build the reel and stream it                  |
| `marquee stream <file>` | Play an already-built video                   |
| `marquee setup`         | Re-run the setup wizard                       |
| `marquee check`         | Verify everything is configured and reachable |

## 🛠️ Development

Built with [Bun](https://bun.sh) + TypeScript.

```bash
bun install
bun run download-bins # fetch ffmpeg, ffprobe, yt-dlp into vendor/
pip install pyinstaller # build tool for atvremote (pyatv is pinned by the script)
bun run scripts/build-atvremote.ts # build atvremote
bun run start <command> # run from source
bun run build:binary # compile a standalone binary
```
