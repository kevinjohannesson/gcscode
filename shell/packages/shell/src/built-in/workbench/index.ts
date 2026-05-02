import type { Extension, ExtensionContext, QuickPickItem } from '@gcscode/extension-api';

import type { Registry } from '../../extension-host/registry';

interface CommandPickItem extends QuickPickItem {
  commandId: string;
}

/**
 * The shell's built-in extension. Registers the command palette and its
 * default keybinding via the same public APIs any third-party extension
 * uses — the palette appears in itself ("Workbench: Show All Commands").
 *
 * Takes a `Registry` so the palette handler can read the live command list
 * via `registry.listCommands()`. Extensions can't introspect the registry
 * through the public host (they only contribute), but the workbench is
 * shell-internal, so it gets direct access at construction time.
 */
export function createWorkbenchExtension(registry: Registry): Extension {
  return {
    id: 'workbench',
    displayName: 'Workbench',
    version: '0.0.0',
    activate(context: ExtensionContext) {
      const showCommands = context.host.commands.registerCommand({
        id: 'workbench.action.showCommands',
        title: 'Show All Commands',
        category: 'Workbench',
        run: async () => {
          const items: CommandPickItem[] = registry
            .listCommands()
            .filter((c) => c.title !== undefined)
            .map((c) => ({
              label: c.category ? `${c.category}: ${c.title}` : (c.title as string),
              commandId: c.id,
            }));

          const picked = await context.host.window.showQuickPick(items, {
            placeholder: 'Type a command name',
          });
          if (picked === undefined) return;
          await context.host.commands.executeCommand(picked.commandId);
        },
      });

      const keybinding = context.host.keybindings.registerKeybinding({
        key: 'Ctrl+Shift+P',
        command: 'workbench.action.showCommands',
      });

      context.subscriptions.push(showCommands, keybinding);
    },
  };
}
