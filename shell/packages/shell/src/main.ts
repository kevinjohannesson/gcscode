import { mount } from 'svelte';

import 'dockview-core/dist/styles/dockview.css';
import './app.css';
import App from './app.svelte';
import { attachKeybindingDispatcher } from './keybinding-dispatcher';
import { bootstrap } from './extension-host/bootstrap';
import { createExtensionManager } from './extension-host/extension-manager';
import { bundledExtensions } from './extension-host/bundled-extensions';
import { createExtensionPersistence } from './extension-host/extension-persistence';
import { createRegistry } from './extension-host/registry';
import { createWorkbenchExtension } from './built-in/workbench';

const registry = createRegistry();
const persistence = createExtensionPersistence();
const manager = createExtensionManager(registry, {
  onEnabledChanged: (id, enabled) => persistence.recordEnabledChange(id, enabled),
});

// Workbench is the shell's built-in extension. It registers the command
// palette + Ctrl+Shift+P. Always enabled; not tracked in persistence
// (the palette must always be available).
//
// Registration lives in `bootstrap` rather than inline here so a test can
// reach it: a failing activation must not stop the extensions after it, and
// at module scope that guarantee was untestable.
bootstrap({
  registry,
  manager,
  persistence,
  extensions: bundledExtensions,
  builtIns: [createWorkbenchExtension(registry)],
});

attachKeybindingDispatcher(registry, document);

mount(App, {
  target: document.getElementById('app')!,
  props: { registry, manager },
});
