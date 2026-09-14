import { pickLocalVideos } from '../services/ads.ts'

import { SourceFieldType } from './types.ts'
import type {
  LocalSourceConfig,
  SourceResult,
  VideoSelectionOptions,
  VideoSourcePlugin
} from './types.ts'

export const localSourcePlugin: VideoSourcePlugin<LocalSourceConfig> = {
  id: 'local',
  label: 'Local folder',
  description: 'Play video files from a folder on this machine.',
  configFields: [
    {
      key: 'dir',
      type: SourceFieldType.Dir,
      label: 'Folder path',
      placeholder: '/path/to/videos',
      hint: 'Absolute path to a folder of video files',
      required: true
    }
  ],
  requiresValidation: false,
  async fetch(
    options: VideoSelectionOptions,
    config: LocalSourceConfig
  ): Promise<SourceResult[]> {
    const results = await pickLocalVideos(config.dir, options)
    return results.map(r => ({ filePath: r.filePath, title: r.title }))
  }
}
