import { mount } from 'svelte'

import './rpc.ts'
import App from './App.svelte'
import './styles/global.css'

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
