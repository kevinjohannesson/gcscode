import type {
  CommandContribution,
  Disposable,
  Plugin,
  PluginContext,
  PluginHost,
  PluginIdentity,
  StatusBarItemContribution,
  ViewContribution,
} from '@gcscode/plugin-api';

export interface Registry {
  activate(plugin: Plugin): void;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
}

// Invariant: all registry.activate(plugin) calls must complete before App
// mounts. Registration is not reactive — consumers read via
// $derived(registry.listViews()), which snapshots at mount time. Post-mount
// registration is out of scope (see docs/out-of-scope.md).
export function createRegistry(): Registry {
  const views = new Map<string, ViewContribution>();
  const statusBarItems = new Map<string, StatusBarItemContribution>();
  const commands = new Map<string, CommandContribution>();
  const subscriptionsByPlugin = new Map<string, readonly Disposable[]>();

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
    listViews() {
      return Array.from(views.values());
    },
    listStatusBarItems() {
      return Array.from(statusBarItems.values());
    },
    listCommands() {
      return Array.from(commands.values());
    },
  };
}
