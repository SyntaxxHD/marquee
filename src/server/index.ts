import { loadUserConfig } from '../config.ts'
import { lightsHandlers } from '../desktop/rpc/lights.ts'
import { serverHandlers } from '../desktop/rpc/server.ts'
import { setupHandlers } from '../desktop/rpc/setup.ts'
import { showControlHandlers } from '../desktop/rpc/show-control.ts'
import { initFromConfig } from '../desktop/show.ts'
import { registerWsBroadcaster, state } from '../desktop/state.ts'

import { createWsTransport } from './ws-transport.ts'

const userConfig = await loadUserConfig()
const port = userConfig?.serverPort ?? 4242
const bind = userConfig?.serverBind === 'network' ? '0.0.0.0' : '127.0.0.1'

const allHandlers = {
  ...setupHandlers,
  ...showControlHandlers,
  ...lightsHandlers,
  ...serverHandlers
}

const { broadcaster, start } = createWsTransport(allHandlers, () => state)
registerWsBroadcaster(broadcaster)
start(port, bind)

console.log(
  `Marquee server running at http://${bind === '0.0.0.0' ? 'localhost' : bind}:${port}`
)

await initFromConfig()

process.on('SIGTERM', () => process.exit(0))
