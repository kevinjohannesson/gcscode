import type { Extension, ExtensionContext, QuickPickItem } from '@gcscode/extension-api';

import type { Registry } from '../../extension-host/registry';
import { extensionsPanelState } from '../../extensions-panel/extensions-panel-state.svelte';

interface CommandPickItem extends QuickPickItem {
  commandId: string;
}

/**
 * The shell's built-in extension. Registers the command palette (Ctrl+Shift+P)
 * and the extensions panel (Ctrl+Shift+X) via the same public APIs any
 * third-party extension uses — the palette appears in itself ("Workbench: Show
 * All Commands") and the panel command ("Workbench: Show Installed Extensions")
 * is fired by the matching keybinding or by selecting it from the palette.
 *
 * Takes a `Registry` so the palette handler can read the live command list
 * via `registry.listCommands()`. Extensions can't introspect the registry
 * through the public host (they only contribute), but the workbench is
 * shell-internal, so it gets direct access at construction time.
 */
export function createWorkbenchExtension(registry: Registry): Extension {
  return {
    manifest: {
      id: 'workbench',
      displayName: 'Workbench',
      version: '0.0.0',
      description:
        "The shell's built-in extension. Registers the command palette (Ctrl+Shift+P) and the extensions panel (Ctrl+Shift+X).",
    },
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

      const showExtensions = context.host.commands.registerCommand({
        id: 'workbench.extensions.action.showInstalledExtensions',
        title: 'Show Installed Extensions',
        category: 'Workbench',
        run: () => {
          extensionsPanelState.open();
        },
      });

      const extensionsKeybinding = context.host.keybindings.registerKeybinding({
        key: 'Ctrl+Shift+X',
        command: 'workbench.extensions.action.showInstalledExtensions',
      });

      context.subscriptions.push(showCommands, keybinding, showExtensions, extensionsKeybinding);
    },
  };
}
