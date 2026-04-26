import { mount } from 'svelte';

import { examplePlugin } from '@gcscode/plugin-example';

import './app.css';
import App from './app.svelte';
import { attachKeybindingDispatcher } from './keybinding-dispatcher';
import { createRegistry } from './plugin-host/registry';

const registry = createRegistry();
registry.activate(examplePlugin);

attachKeybindingDispatcher(registry, document);

mount(App, {
  target: document.getElementById('app')!,
  props: { registry },
});
