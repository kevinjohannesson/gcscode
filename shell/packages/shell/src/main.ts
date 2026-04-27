import { mount } from 'svelte';

import './app.css';
import App from './app.svelte';
import { attachKeybindingDispatcher } from './keybinding-dispatcher';
import { createExtensionManager } from './extension-host/extension-manager';
import { bundledExtensions } from './extension-host/extension-manifest';
import { createExtensionPersistence } from './extension-host/extension-persistence';
import { createRegistry } from './extension-host/registry';

const registry = createRegistry();
const persistence = createExtensionPersistence();
const manager = createExtensionManager(registry, {
  onEnabledChanged: (id, enabled) => persistence.recordEnabledChange(id, enabled),
});

for (const { id, extension, initialEnabled = true } of bundledExtensions) {
  manager.register(extension, {
    enabled: persistence.isInitiallyEnabled(id, initialEnabled),
  });
}

attachKeybindingDispatcher(registry, document);

mount(App, {
  target: document.getElementById('app')!,
  props: { registry },
});
