import { SvelteMap } from 'svelte/reactivity';

import type { Extension } from '@gcscode/extension-api';

import type { Registry } from './registry';

interface ExtensionState {
  extension: Extension;
  enabled: boolean;
}

export interface ExtensionRecord {
  id: string;
  displayName: string;
  version: string;
  enabled: boolean;
}

export interface ExtensionManager {
  register(extension: Extension): void;
  setEnabled(id: string, enabled: boolean): void;
  listExtensions(): readonly ExtensionRecord[];
}

function toRecord(state: ExtensionState): ExtensionRecord {
  return {
    id: state.extension.id,
    displayName: state.extension.displayName,
    version: state.extension.version,
    enabled: state.enabled,
  };
}

// Invariant: extensions are registered exactly once and stay registered for
// the manager's lifetime. The manager retains Extension references so re-enable
// can re-feed Registry.activate (per the B1 forecast: "the registry is in a
// clean state with respect to that extension id; the caller re-passes the
// extension"). The internal map is a SvelteMap so listExtensions() is reactive
// to setEnabled mutations — same pattern as Registry.list*() post-B2a.
export function createExtensionManager(registry: Registry): ExtensionManager {
  const extensions = new SvelteMap<string, ExtensionState>();

  return {
    register(extension) {
      if (extensions.has(extension.id)) {
        throw new Error(`Extension id "${extension.id}" is already registered.`);
      }
      extensions.set(extension.id, { extension, enabled: true });
      registry.activate(extension);
    },
    setEnabled(id, enabled) {
      const state = extensions.get(id);
      if (state === undefined) {
        throw new Error(`Cannot set enabled state: extension id "${id}" is not registered.`);
      }
      if (state.enabled === enabled) {
        return;
      }
      if (enabled) {
        registry.activate(state.extension);
      } else {
        registry.deactivate(id);
      }
      extensions.set(id, { ...state, enabled });
    },
    listExtensions() {
      return Array.from(extensions.values()).map(toRecord);
    },
  };
}
