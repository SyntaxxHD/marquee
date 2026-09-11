import type { ElectrobunConfig } from 'electrobun'

import pkg from './package.json'

export default {
  app: {
    name: 'marquee',
    identifier: 'com.marquee.app',
    version: pkg.version
  },
  build: {
    mainProcess: 'bun',
    bun: {
      entrypoint: 'src/desktop/index.ts'
    },
    copy: {
      'dist/index.html': 'views/mainview/index.html',
      'dist/assets': 'views/mainview/assets',
      'vendor/ffmpeg': 'vendor/ffmpeg',
      'vendor/ffprobe': 'vendor/ffprobe',
      'vendor/yt-dlp': 'vendor/yt-dlp',
      'vendor/atvremote': 'vendor/atvremote'
    },
    watch: [
      'src/desktop',
      'src/services',
      'src/backends',
      'src/commands',
      'src/utils',
      'src/lights',
      'src/shared'
    ],
    watchIgnore: ['dist/**'],
    mac: {
      bundleCEF: false,
      icons: 'assets/marquee.icon',
      codesign: true,
      notarize: true
    },
    linux: { bundleCEF: false, icon: 'assets/marquee-linux.png' },
    win: { bundleCEF: false, icon: 'assets/marquee-windows.ico' }
  },
  runtime: {
    exitOnLastWindowClosed: true
  }
} satisfies ElectrobunConfig
