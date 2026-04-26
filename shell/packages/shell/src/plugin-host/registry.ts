import type {
  CommandContribution,
  Disposable,
  KeybindingContribution,
  Plugin,
  PluginContext,
  PluginHost,
  PluginIdentity,
  StatusBarItemContribution,
  ViewContribution,
} from '@gcscode/plugin-api';

export interface Registry {
  activate(plugin: Plugin): void;
  deactivate(pluginId: string): void;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
  listKeybindings(): readonly KeybindingContribution[];
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}

// Invariant: registry mutations (activate, deactivate, individual dispose
// calls) do not propagate reactively to mounted consumers. Consumers read
// via $derived(registry.listViews()), which snapshots at mount time. Post-
// mount mutation works at the registry level but the rendered UI will not
// update. Reactive propagation is out of scope (see docs/out-of-scope.md);
// pre-mount activation and test-only deactivation are the supported callers
// today.
export function createRegistry(): Registry {
  const views = new Map<string, ViewContribution>();
  const statusBarItems = new Map<string, StatusBarItemContribution>();
  const commands = new Map<string, CommandContribution>();
  const keybindings = new Map<string, KeybindingContribution>();
  const subscriptionsByPlugin = new Map<string, readonly Disposable[]>();

  function execute<T>(id: string, args: unknown[], attribution: string): Promise<T> {
    const command = commands.get(id);
    if (command === undefined) {
      throw new Error(`Command id "${id}" is not registered (attempted by ${attribution}).`);
    }
    return Promise.resolve().then(() => command.run(...args)) as Promise<T>;
  }

  function createHost(plugin: PluginIdentity): PluginHost {
    return {
      registerView(view) {
        if (views.has(view.id)) {
          throw new Error(
            `View id "${view.id}" is already registered (attempted by plugin "${plugin.id}").`,
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
            `Status bar item id "${item.id}" is already registered (attempted by plugin "${plugin.id}").`,
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
      registerCommand(command) {
        if (commands.has(command.id)) {
          throw new Error(
            `Command id "${command.id}" is already registered (attempted by plugin "${plugin.id}").`,
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
      registerKeybinding(keybinding) {
        if (keybindings.has(keybinding.key)) {
          throw new Error(
            `Keybinding "${keybinding.key}" is already registered (attempted by plugin "${plugin.id}").`,
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
      executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
        return execute<T>(id, args, `plugin "${plugin.id}"`);
      },
    };
  }

  return {
    activate(plugin) {
      const identity: PluginIdentity = {
        id: plugin.id,
        displayName: plugin.displayName,
        version: plugin.version,
      };
      const context: PluginContext = {
        host: createHost(identity),
        subscriptions: [],
        plugin: identity,
      };
      plugin.activate(context);
      subscriptionsByPlugin.set(identity.id, context.subscriptions);
    },
    deactivate(pluginId) {
      const subscriptions = subscriptionsByPlugin.get(pluginId);
      if (subscriptions === undefined) {
        throw new Error(`Cannot deactivate plugin: id "${pluginId}" is not active.`);
      }
      // LIFO: dispose in reverse registration order. A plugin that registers a
      // higher-level disposable later may depend on lower-level ones registered
      // earlier; reverse order tears down the higher-level layer first.
      for (let i = subscriptions.length - 1; i >= 0; i--) {
        try {
          subscriptions[i].dispose();
        } catch (error) {
          console.error(`Error disposing subscription for plugin "${pluginId}":`, error);
        }
      }
      subscriptionsByPlugin.delete(pluginId);
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
