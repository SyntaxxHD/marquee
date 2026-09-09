import { resolve } from 'node:path'

import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

import { electrobunViteAliases } from './.hutch/devkit/api/config/electrobun-vite.ts'

const devkitDir = resolve(import.meta.dirname, '.hutch/devkit')
const sharedDir = resolve(import.meta.dirname, 'src/shared')

export default defineConfig({
  plugins: [svelte({ configFile: resolve(import.meta.dirname, 'svelte.config.js') })],
  resolve: {
    alias: [
      { find: /^\$shared\/(.*)/, replacement: `${sharedDir}/$1` },
      ...electrobunViteAliases(devkitDir)
    ]
  },
  root: 'src/mainview',
  build: {
    outDir: '../../dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [resolve(import.meta.dirname, 'src'), devkitDir]
    }
  }
})
