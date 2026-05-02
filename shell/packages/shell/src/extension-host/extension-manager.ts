import { SvelteMap } from 'svelte/reactivity';

import type { Extension, ExtensionManifest } from '@gcscode/extension-api';

import type { Registry } from './registry';

interface ExtensionState {
  extension: Extension;
  enabled: boolean;
}

export interface ExtensionRecord {
  readonly manifest: ExtensionManifest;
  readonly enabled: boolean;
}

export interface ExtensionManager {
  register(extension: Extension, options?: { enabled?: boolean }): void;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  listExtensions(): readonly ExtensionRecord[];
}

function toRecord(state: ExtensionState): ExtensionRecord {
  return {
    manifest: state.extension.manifest,
    enabled: state.enabled,
  };
}

// Invariant: extensions are registered exactly once and stay registered for
// the manager's lifetime. The manager retains Extension references so re-enable
// can re-feed Registry.activate (per the B1 forecast: "the registry is in a
// clean state with respect to that extension id; the caller re-passes the
// extension"). The internal map is a SvelteMap so listExtensions() is reactive
// to setEnabled mutations — same pattern as Registry.list*() post-B2a.
export function createExtensionManager(
  registry: Registry,
  options: { onEnabledChanged?: (id: string, enabled: boolean) => void } = {},
): ExtensionManager {
  const extensions = new SvelteMap<string, ExtensionState>();
  const onEnabledChanged = options.onEnabledChanged;

  return {
    register(extension, registerOptions) {
      if (extensions.has(extension.manifest.id)) {
        throw new Error(`Extension id "${extension.manifest.id}" is already registered.`);
      }
      const enabled = registerOptions?.enabled ?? true;
      extensions.set(extension.manifest.id, { extension, enabled });
      if (enabled) {
        registry.activate(extension);
      }
    },
    async setEnabled(id, enabled) {
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
        await registry.deactivate(id);
      }
      extensions.set(id, { ...state, enabled });
      onEnabledChanged?.(id, enabled);
    },
    listExtensions() {
      return Array.from(extensions.values()).map(toRecord);
    },
  };
}
