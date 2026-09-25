export enum Section {
  Playback = 'playback',
  Content = 'content',
  Output = 'output',
  Lights = 'lights',
  Deployment = 'deployment'
}

export enum SectionState {
  Pending = 'pending',
  Active = 'active',
  Done = 'done'
}

export enum PlaybackStep {
  Method = 'method',
  Scan = 'scan',
  Select = 'select',
  Pair = 'pair',
  Done = 'done'
}

export enum HueStep {
  Idle = 'idle',
  Discovering = 'discovering',
  BridgeSelect = 'bridge-select',
  PairPrompt = 'pair-prompt',
  Pairing = 'pairing',
  Lights = 'lights',
  Done = 'done'
}
