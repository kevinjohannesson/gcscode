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

// `String(value)` is not safe on an arbitrary thrown value: it throws for one
// with no primitive conversion (`Object.create(null)`) and for one whose
// `toString`/`Symbol.toPrimitive` throws, and nothing constrains what an
// extension throws. Both callers below run inside a containment catch, where a
// throw would escape the catch, escape `register`, and halt boot — Goal 1. So
// conversion failure degrades to the caller's fallback instead of propagating.
// The full value still reaches the console via `console.error`.
function describeValue(value: unknown, fallback: string): string {
  try {
    return String(value) || fallback;
  } catch {
    return fallback;
  }
}

// The operator-facing half of an activation failure. `ExtensionActivationError`
// is the host's wrapper, so its own message names the extension rather than the
// problem; the wrapped `cause` is what the panel row needs to show.
function failureMessage(error: unknown): string {
  if (error instanceof ExtensionActivationError) {
    const cause = error.cause;
    if (cause instanceof Error) return cause.message || error.message;
    // A non-`Error` cause (`throw 'boom'`) is still the only detail the
    // operator has, so describe it. The wrapper's message is the fallback for
    // an absent, empty, or undescribable cause, where describing says nothing.
    if (cause === undefined || cause === null) return error.message;
    return describeValue(cause, error.message);
  }
  if (error instanceof Error) return error.message;
  // Not an `ExtensionActivationError`: there is no wrapper message to fall back
  // to, so the fallback has to be generic.
  return describeValue(error, 'Activation failed; the thrown value has no description.');
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
        //
        // One of a MATCHED PAIR with the catch in `setEnabled`'s enable branch.
        // Both are required and neither covers the other: this one keeps the
        // boot loop going past a boot-time failure; its twin keeps an
        // operator's toggle from crashing while still recording their intent.
        // An earlier draft of this work deleted the twin while tidying, which
        // reinstated the exact defect containment exists to fix. Do not factor
        // them together — losing one is silent.
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
      // Same-value calls stay a no-op even when the record carries a failure.
      //
      // Deliberate deviation from the implementation plan, which guards on
      // `state.enabled === enabled && state.failure === undefined`. That extra
      // clause makes `setEnabled(id, true)` on a failed record re-enter
      // `activate()` — the in-place retry the spec forbids (Architecture,
      // "There is no in-place retry"; Non-goals). Extensions are module
      // singletons: `extension-sitl` reassigns its module-level `client`
      // without closing the previous socket, so a second `activate()` leaks a
      // WebSocket. Reload, which gives fresh module state, is the retry
      // mechanism.
      if (state.enabled === enabled) {
        return;
      }

      if (enabled) {
        try {
          registry.activate(state.extension);
          extensions.set(id, { extension: state.extension, enabled: true });
        } catch (error) {
          // The twin of `register`'s catch (read the note there). Kept separate
          // on purpose: this path must RESOLVE rather than reject, because the
          // extensions panel invokes `setEnabled` as a floating promise, and it
          // must still record the operator's intent below.
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

      // Disabling. A failed record has nothing active to tear down, and the
      // reason is structural rather than incidental: `registry.activate` runs
      // the whole activation inside one try/catch — the extension's own call,
      // the thenable probe, the `deactivate` capture and the registry-map
      // writes — and its catch removes any map state the attempt had written
      // before failing. A failed activation therefore cannot leave registry
      // state behind, so `failure !== undefined` implies not-active.
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
