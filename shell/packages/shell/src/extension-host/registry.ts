import type {
  CommandContribution,
  Disposable,
  Extension,
  ExtensionContext,
  ExtensionHost,
  ExtensionIdentity,
  KeybindingContribution,
  StatusBarItemContribution,
  ViewContribution,
} from '@gcscode/extension-api';

import { SvelteMap } from 'svelte/reactivity';

export interface Registry {
  activate(extension: Extension): void;
  deactivate(extensionId: string): Promise<void>;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
  listKeybindings(): readonly KeybindingContribution[];
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}

// Invariant: registry mutations propagate reactively to mounted consumers.
// The four contribution maps and the cross-extension exports map are SvelteMap
// instances (from svelte/reactivity), so $derived(registry.list*()) and
// $derived(host.getExtension(...)) re-track on set/delete and the rendered UI
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

  function execute<T>(id: string, args: unknown[], attribution: string): Promise<T> {
    const command = commands.get(id);
    if (command === undefined) {
      throw new Error(`Command id "${id}" is not registered (attempted by ${attribution}).`);
    }
    return Promise.resolve().then(() => command.run(...args)) as Promise<T>;
  }

  function createHost(extension: ExtensionIdentity): ExtensionHost {
    return {
      commands: {
        registerCommand(command) {
          if (commands.has(command.id)) {
            throw new Error(
              `Command id "${command.id}" is already registered (attempted by extension "${extension.id}").`,
            );
          }
          commands.set(command.id, command);
          return {
            dispose() {
              // Idempotent and safe under re-registration: only delete if the
              // entry currently in the map is the one this disposable owns.
              if (commands.get(command.id) === command) {
                commands.delete(command.id);
              }
            },
          };
        },
        executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
          return execute<T>(id, args, `extension "${extension.id}"`);
        },
      },
      window: {
        registerView(view) {
          if (views.has(view.id)) {
            throw new Error(
              `View id "${view.id}" is already registered (attempted by extension "${extension.id}").`,
            );
          }
          views.set(view.id, view);
          return {
            dispose() {
              // Idempotent and safe under re-registration: only delete if the
              // entry currently in the map is the one this disposable owns.
              if (views.get(view.id) === view) {
                views.delete(view.id);
              }
            },
          };
        },
        registerStatusBarItem(item) {
          if (statusBarItems.has(item.id)) {
            throw new Error(
              `Status bar item id "${item.id}" is already registered (attempted by extension "${extension.id}").`,
            );
          }
          statusBarItems.set(item.id, item);
          return {
            dispose() {
              // Idempotent and safe under re-registration: only delete if the
              // entry currently in the map is the one this disposable owns.
              if (statusBarItems.get(item.id) === item) {
                statusBarItems.delete(item.id);
              }
            },
          };
        },
      },
      keybindings: {
        registerKeybinding(keybinding) {
          if (keybindings.has(keybinding.key)) {
            throw new Error(
              `Keybinding "${keybinding.key}" is already registered (attempted by extension "${extension.id}").`,
            );
          }
          keybindings.set(keybinding.key, keybinding);
          return {
            dispose() {
              // Idempotent and safe under re-registration: only delete if the
              // entry currently in the map is the one this disposable owns.
              if (keybindings.get(keybinding.key) === keybinding) {
                keybindings.delete(keybinding.key);
              }
            },
          };
        },
      },
      extensions: {
        getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined {
          if (!exportsByExtension.has(id)) return undefined;
          return { id, exports: exportsByExtension.get(id) as T };
        },
      },
    };
  }

  return {
    activate(extension) {
      const identity: ExtensionIdentity = {
        id: extension.id,
        displayName: extension.displayName,
        version: extension.version,
      };
      const context: ExtensionContext = {
        host: createHost(identity),
        subscriptions: [],
        extension: identity,
      };
      const exportsValue = extension.activate(context);
      subscriptionsByExtension.set(identity.id, context.subscriptions);
      if (extension.deactivate) {
        deactivateHooksByExtension.set(identity.id, extension.deactivate.bind(extension));
      }
      exportsByExtension.set(identity.id, exportsValue);
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

      // LIFO: dispose in reverse registration order. An extension that registers a
      // higher-level disposable later may depend on lower-level ones registered
      // earlier; reverse order tears down the higher-level layer first.
      for (let i = subscriptions.length - 1; i >= 0; i--) {
        try {
          subscriptions[i].dispose();
        } catch (error) {
          console.error(`Error disposing subscription for extension "${extensionId}":`, error);
        }
      }
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
