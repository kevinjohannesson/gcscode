import type { Disposable } from '@gcscode/extension-api';

import { extensionsPanelState } from './extensions-panel/extensions-panel-state.svelte';
import { quickPickState } from './quick-pick/quick-pick-state.svelte';

/**
 * Whether a modal-style overlay (the quick pick or the extensions panel) is
 * open. The keybinding dispatcher reads `active` and skips keybindings while it
 * is true, so the open overlay's own keyboard handling (Enter, Esc, ArrowUp /
 * ArrowDown, typed text) is not double-fired by the dispatcher.
 *
 * `active` is derived from both overlays' own state rather than written by
 * their hosts. Two hosts writing one flag raced when one overlay replaced the
 * other: the closing host's effect could run after the opening host's and
 * leave the flag false with an overlay open.
 *
 * A few commands still fire while an overlay is open: the ones that open an
 * overlay, so that Ctrl+Shift+X from the command palette replaces it with the
 * extensions panel and Ctrl+Shift+P does the reverse. The workbench names them
 * with `allowWhileActive`. Modal stacking is not supported: at most one overlay
 * is open at a time, and opening one closes the other.
 */
class ModalState {
  private readonly _active = $derived(
    quickPickState.current !== null || extensionsPanelState.isOpen,
  );
  private readonly _allowed = new Map<string, number>();

  public get active(): boolean {
    return this._active;
  }

  /** Lets the dispatcher fire `commandId`'s keybindings while an overlay is open. */
  public allowWhileActive(commandId: string): Disposable {
    this._allowed.set(commandId, (this._allowed.get(commandId) ?? 0) + 1);
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        const count = (this._allowed.get(commandId) ?? 0) - 1;
        if (count > 0) this._allowed.set(commandId, count);
        else this._allowed.delete(commandId);
      },
    };
  }

  /** Whether `commandId`'s keybindings fire while an overlay is open. */
  public isAllowedWhileActive(commandId: string): boolean {
    return this._allowed.has(commandId);
  }
}

export const modalState = new ModalState();
