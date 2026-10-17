import type {
  CommandContribution,
  Disposable,
  Extension,
  ExtensionContext,
  ExtensionHost,
  ExtensionIdentity,
  KeybindingContribution,
  QuickPickItem,
  QuickPickOptions,
  StatusBarItemContribution,
  ViewContribution,
} from '@gcscode/extension-api';

import { ConfigurationStore } from '../configuration/configuration-store.svelte';

import { SvelteMap } from 'svelte/reactivity';

import { quickPickState } from '../quick-pick/quick-pick-state.svelte';
import { ExtensionActivationError } from './activation-error';

export interface Registry {
  activate(extension: Extension): void;
  deactivate(extensionId: string): Promise<void>;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
  listKeybindings(): readonly KeybindingContribution[];
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}

/**
 * Dispose in reverse registration order, surviving a disposable that throws.
 * LIFO because a higher-level disposable registered later may depend on a
 * lower-level one registered earlier. Shared by the failed-activation cleanup
 * and `deactivate` so both have the same resilience guarantee.
 */
function disposeAll(disposables: readonly Disposable[], extensionId: string): void {
  for (let i = disposables.length - 1; i >= 0; i--) {
    try {
      disposables[i].dispose();
    } catch (error) {
      console.error(`Error disposing subscription for extension "${extensionId}":`, error);
    }
  }
}

/**
 * Promise-like enough that `await` would adopt it: any object with a callable
 * `then`, not just a native `Promise` — a custom thenable has to be contained
 * the same way. A *callable* thenable (a function carrying `then`) is out of
 * scope; no extension pattern produces one.
 */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

// Invariant: registry mutations propagate reactively to mounted consumers.
// The four contribution maps and the cross-extension exports map are SvelteMap
// instances (from svelte/reactivity), so $derived(registry.list*()) and
// $derived(host.extensions.getExtension(...)) re-track on set/delete and the rendered UI
// updates without remount. subscriptionsByExtension and deactivateHooksByExtension
// stay plain Maps because no UI consumer reads them — the registry uses them
// internally for deactivate orchestration only.
export function createRegistry(): Registry {
  const views = new SvelteMap<string, ViewContribution>();
  const statusBarItems = new SvelteMap<string, StatusBarItemContribution>();
  const commands = new SvelteMap<string, CommandContribution>();
  const keybindings = new SvelteMap<string, KeybindingContribution>();
  const exportsByExtension = new SvelteMap<string, unknown>();
  const subscriptionsByExtension = new Map<string, readonly Disposable[]>();
  const deactivateHooksByExtension = new Map<string, () => void | Promise<void>>();
  const configurationStore = new ConfigurationStore();

  function execute<T>(id: string, args: unknown[], attribution: string): Promise<T> {
    const command = commands.get(id);
    if (command === undefined) {
      throw new Error(`Command id "${id}" is not registered (attempted by ${attribution}).`);
    }
    return Promise.resolve().then(() => command.run(...args)) as Promise<T>;
  }

  /**
   * The pair `createHost` hands back to `activate`: the facade the extension
   * registers through, plus the two activation-window controls. Both are
   * terminal — whichever fires first, the ledger stops growing for the rest of
   * this extension's lifetime — but they differ in what they buy. `revoke` is
   * observable: it closes the facade, so a later registration throws. `settle`
   * is not observable at all; see its own comment below before trusting it to
   * guarantee anything.
   */
  interface ActivationHost {
    readonly host: ExtensionHost;
    readonly revoke: () => void;
    readonly settle: () => void;
  }

  function createHost(extension: ExtensionIdentity, minted: Disposable[]): ActivationHost {
    let revoked = false;
    let tracking = true;

    /** Refuse registration once the activation window has closed. */
    const guard = (): void => {
      if (revoked) {
        throw new Error(
          `Extension "${extension.id}" attempted to register after its activation failed.`,
        );
      }
    };

    /** Record what the host handed out, while the activation window is open. */
    const track = (disposable: Disposable): Disposable => {
      if (tracking) minted.push(disposable);
      return disposable;
    };

    const host: ExtensionHost = {
      commands: {
        registerCommand(command) {
          guard();
          if (commands.has(command.id)) {
            throw new Error(
              `Command id "${command.id}" is already registered (attempted by extension "${extension.id}").`,
            );
          }
          commands.set(command.id, command);
          return track({
            dispose() {
              // Idempotent and safe under re-registration: only delete if the
              // entry currently in the map is the one this disposable owns.
              if (commands.get(command.id) === command) {
                commands.delete(command.id);
              }
            },
          });
        },
        executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
          return execute<T>(id, args, `extension "${extension.id}"`);
        },
      },
      window: {
        registerView(view) {
          guard();
          if (views.has(view.id)) {
            throw new Error(
              `View id "${view.id}" is already registered (attempted by extension "${extension.id}").`,
            );
          }
          views.set(view.id, view);
          return track({
            dispose() {
              // Idempotent and safe under re-registration: only delete if the
              // entry currently in the map is the one this disposable owns.
              if (views.get(view.id) === view) {
                views.delete(view.id);
              }
            },
          });
        },
        registerStatusBarItem(item) {
          guard();
          if (statusBarItems.has(item.id)) {
            throw new Error(
              `Status bar item id "${item.id}" is already registered (attempted by extension "${extension.id}").`,
            );
          }
          statusBarItems.set(item.id, item);
          return track({
            dispose() {
              // Idempotent and safe under re-registration: only delete if the
              // entry currently in the map is the one this disposable owns.
              if (statusBarItems.get(item.id) === item) {
                statusBarItems.delete(item.id);
              }
            },
          });
        },
        showQuickPick<T extends QuickPickItem>(
          items: T[],
          options?: QuickPickOptions,
        ): Promise<T | undefined> {
          return new Promise<T | undefined>((resolve) => {
            quickPickState.open<T>({ items, options, resolve });
          });
        },
      },
      keybindings: {
        registerKeybinding(keybinding) {
          guard();
          if (keybindings.has(keybinding.key)) {
            throw new Error(
              `Keybinding "${keybinding.key}" is already registered (attempted by extension "${extension.id}").`,
            );
          }
          keybindings.set(keybinding.key, keybinding);
          return track({
            dispose() {
              // Idempotent and safe under re-registration: only delete if the
              // entry currently in the map is the one this disposable owns.
              if (keybindings.get(keybinding.key) === keybinding) {
                keybindings.delete(keybinding.key);
              }
            },
          });
        },
      },
      extensions: {
        getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined {
          if (!exportsByExtension.has(id)) return undefined;
          return { id, exports: exportsByExtension.get(id) as T };
        },
      },
      configuration: {
        registerConfiguration(contribution) {
          guard();
          return track(configurationStore.registerConfiguration(contribution, extension.id));
        },
        getConfiguration(section) {
          return configurationStore.getConfiguration(section);
        },
        onDidChangeConfiguration(listener) {
          guard();
          return track(configurationStore.onDidChangeConfiguration(listener));
        },
      },
    };

    return {
      host,
      /** Close the facade: further registration throws. Failure paths only. */
      revoke: () => {
        revoked = true;
        tracking = false;
      },
      /**
       * Activation succeeded, so the ledger will never be read again: `minted`
       * is consumed only by the containment catch, and this extension can no
       * longer fail activation. Stop recording so that array does not go on
       * retaining every disposable a long-lived extension mints afterwards — a
       * command handler that adds and removes a view would otherwise push into
       * a list nothing will ever drain.
       *
       * What this buys is memory hygiene, not a guarantee, and the distinction
       * matters because the wording here used to imply the latter. Nothing
       * observable changes when it runs: the host stays usable (an extension
       * may legitimately register later), and `minted` is unreachable from
       * outside this closure. Neutering this function to a no-op leaves the
       * entire suite green — measured, not assumed. So no test pins it, and
       * spec case 12 is inspection-only by decision: covering it would mean
       * reaching into the closure to manufacture an observable that the public
       * API deliberately does not expose.
       */
      settle: () => {
        tracking = false;
      },
    };
  }

  return {
    activate(extension) {
      const identity: ExtensionIdentity = {
        id: extension.manifest.id,
        displayName: extension.manifest.displayName,
        version: extension.manifest.version,
      };
      const minted: Disposable[] = [];
      const { host, revoke, settle } = createHost(identity, minted);
      const context: ExtensionContext = {
        host,
        subscriptions: [],
        extension: identity,
      };

      // Ledger before `context.subscriptions`, which is not chronological: a
      // disposable the extension pushed may have been minted before one it
      // never pushed. Acceptable because `dispose()` is required to be
      // idempotent and the batched-push case — nothing pushed at all — is the
      // one this ledger exists for. The edge it concedes: an extension whose
      // own pushed resource unwinds through a still-live host-minted
      // contribution finds it already torn down.
      const cleanUpAfterFailure = (): void => {
        revoke();
        disposeAll(minted, identity.id);
        disposeAll(context.subscriptions, identity.id);
      };

      // One window over the whole activation, not just the `activate()` call.
      // Two of the steps in here run extension-controlled code: the thenable
      // probe reads a `then` the extension owns (a throwing getter is enough),
      // and so does the `deactivate` capture. A narrower window let those
      // escape unwrapped with the extension's contributions still live and the
      // host unrevoked — the hole a final cross-cutting review found.
      //
      // The map writes below cannot run extension code, so including them is a
      // deliberate fail-closed trade: a host-side write failure is attributed
      // to the extension and tears it down, rather than leaving the registry
      // half-written. It also removes an asymmetry — every contribution map is
      // already written inside this window during `activate()`, so host-side
      // map failures were always attributed this way; these three now match.
      let registryStateWritten = false;
      try {
        const exportsValue: unknown = extension.activate(context);

        if (isThenable(exportsValue)) {
          // Observe the rejection: not awaiting it is what orphans it. The body
          // has already run to its first await, so the revoke in the catch
          // below lands before it resumes.
          void exportsValue.then(undefined, (reason: unknown) => {
            console.error(
              `Extension "${identity.id}" activate() rejected after returning:`,
              reason,
            );
          });
          throw new Error('activate() must be synchronous; it returned a thenable.');
        }

        // Capture the hook before any map write, so the last extension-owned
        // read happens while the maps are still untouched.
        const deactivateHook = extension.deactivate?.bind(extension);

        registryStateWritten = true;
        subscriptionsByExtension.set(identity.id, context.subscriptions);
        if (deactivateHook !== undefined) {
          deactivateHooksByExtension.set(identity.id, deactivateHook);
        }
        exportsByExtension.set(identity.id, exportsValue);
        // Stop recording. Memory hygiene only, and unobservable from outside —
        // see `settle` in `createHost` for what it does and does not buy.
        settle();
      } catch (cause) {
        // Remove whatever this attempt wrote. Guarded by the flag rather than
        // deleted unconditionally: a failure that happened before the write
        // phase must not evict an earlier live activation's entries under the
        // same id.
        if (registryStateWritten) {
          subscriptionsByExtension.delete(identity.id);
          deactivateHooksByExtension.delete(identity.id);
          exportsByExtension.delete(identity.id);
        }
        cleanUpAfterFailure();
        throw new ExtensionActivationError(identity.id, cause);
      }
    },
    async deactivate(extensionId) {
      const subscriptions = subscriptionsByExtension.get(extensionId);
      if (subscriptions === undefined) {
        throw new Error(`Cannot deactivate extension: id "${extensionId}" is not active.`);
      }

      const hook = deactivateHooksByExtension.get(extensionId);
      if (hook !== undefined) {
        try {
          await hook();
        } catch (error) {
          console.error(`Error in extension "${extensionId}" deactivate hook:`, error);
        }
      }

      disposeAll(subscriptions, extensionId);
      subscriptionsByExtension.delete(extensionId);
      deactivateHooksByExtension.delete(extensionId);
      exportsByExtension.delete(extensionId);
    },
    listViews() {
      return Array.from(views.values());
    },
    listStatusBarItems() {
      return Array.from(statusBarItems.values());
    },
    listCommands() {
      return Array.from(commands.values());
    },
    listKeybindings() {
      return Array.from(keybindings.values());
    },
    executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
      return execute<T>(id, args, 'host');
    },
  };
}
