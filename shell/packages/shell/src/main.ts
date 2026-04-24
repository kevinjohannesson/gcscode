import { mount } from 'svelte';

import { examplePlugin } from '@gcscode/plugin-example';

import './app.css';
import App from './app.svelte';
import { createRegistry } from './plugin-host/registry';

const registry = createRegistry();
examplePlugin.activate(registry.createHost());

mount(App, {
  target: document.getElementById('app')!,
  props: { registry },
});
