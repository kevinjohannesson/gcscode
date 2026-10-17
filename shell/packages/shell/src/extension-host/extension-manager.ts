import { SvelteMap } from 'svelte/reactivity';

import type { Extension, ExtensionManifest } from '@gcscode/extension-api';

import { ExtensionActivationError } from './activation-error';
import type { Registry } from './registry';

interface ExtensionState {
  extension: Extension;
  enabled: boolean;
  failure?: { readonly message: string };
}

export interface ExtensionRecord {
  readonly manifest: ExtensionManifest;
  readonly enabled: boolean;
  /** Present iff the most recent activation attempt failed. */
  readonly failure?: { readonly message: string };
}

export interface ExtensionManager {
  register(extension: Extension, options?: { enabled?: boolean }): void;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  listExtensions(): readonly ExtensionRecord[];
}

function toRecord(state: ExtensionState): ExtensionRecord {
  return state.failure === undefined
    ? { manifest: state.extension.manifest, enabled: state.enabled }
    : { manifest: state.extension.manifest, enabled: state.enabled, failure: state.failure };
}

// The operator-facing half of an activation failure. `ExtensionActivationError`
// is the host's wrapper, so its own message names the extension rather than the
// problem; the wrapped `cause` is what the panel row needs to show.
function failureMessage(error: unknown): string {
  if (error instanceof ExtensionActivationError) {
    const cause = error.cause;
    if (cause instanceof Error && cause.message) return cause.message;
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
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
      if (!enabled) return;
      try {
        registry.activate(extension);
      } catch (error) {
        // Contain it: boot continues, the failure is on the record, and
        // persistence is NOT touched — the operator asked for nothing.
        console.error(error);
        extensions.set(extension.manifest.id, {
          extension,
          enabled: true,
          failure: { message: failureMessage(error) },
        });
      }
    },
    async setEnabled(id, enabled) {
      const state = extensions.get(id);
      if (state === undefined) {
        throw new Error(`Cannot set enabled state: extension id "${id}" is not registered.`);
      }
      // Same-value calls stay a no-op even when the record carries a failure:
      // re-entering `activate()` on a live module is unsafe, so reload is the
      // retry mechanism and there is no in-place retry (spec Architecture).
      if (state.enabled === enabled) {
        return;
      }

      if (enabled) {
        try {
          registry.activate(state.extension);
          extensions.set(id, { extension: state.extension, enabled: true });
        } catch (error) {
          console.error(error);
          extensions.set(id, {
            extension: state.extension,
            enabled: true,
            failure: { message: failureMessage(error) },
          });
        }
        // Operator intent is recorded either way, so the next load retries.
        onEnabledChanged?.(id, true);
        return;
      }

      // Disabling. A failed record has nothing active to tear down: no path
      // writes the registry's maps without a completed synchronous activation,
      // so `failure !== undefined` implies not-active.
      if (state.failure === undefined) {
        await registry.deactivate(id);
      }
      extensions.set(id, { extension: state.extension, enabled: false });
      onEnabledChanged?.(id, false);
    },
    listExtensions() {
      return Array.from(extensions.values()).map(toRecord);
    },
  };
}
