export default {
  scripts: {
    prepare: 'hutch electrobun prepare',
    'ui:build': 'hutch pm exec -- vite build',
    'ui:dev': 'hutch electrobun prepare && hutch pm exec -- vite --port 5173',
    dev: 'hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev --watch',
    'dev:hmr': [
      'hutch',
      'pm',
      'exec',
      '--',
      'concurrently',
      'hutch run ui:dev',
      'hutch run dev'
    ],
    build:
      'hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=stable'
  },
  electrobun: {
    version: '2.0.1'
  }
}
