import { mount } from 'svelte';

import { exampleExtension } from '@gcscode/extension-example';

import './app.css';
import App from './app.svelte';
import { attachKeybindingDispatcher } from './keybinding-dispatcher';
import { createExtensionManager } from './extension-host/extension-manager';
import { createRegistry } from './extension-host/registry';

const registry = createRegistry();
const manager = createExtensionManager(registry);
manager.register(exampleExtension);

attachKeybindingDispatcher(registry, document);

mount(App, {
  target: document.getElementById('app')!,
  props: { registry },
});
