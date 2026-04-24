import { mount } from 'svelte';

import './app.css';
import App from './app.svelte';
import { createRegistry } from './plugin-host/registry';

const registry = createRegistry();

mount(App, {
  target: document.getElementById('app')!,
  props: { registry },
});
