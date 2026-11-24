import { quickPickState } from '../quick-pick/quick-pick-state.svelte';

/**
 * Owns the extensions-panel's open/closed state. At most one panel is open
 * at a time, and never together with the quick pick. The panel is a sustained
 * interaction surface, not a request-response, so there's no resolve callback.
 *
 * `open()` throws if already open OR if the quick pick is open. `show()` is
 * what the operator's Ctrl+Shift+X reaches: it dismisses an open quick pick
 * and opens the panel if it isn't already, and never throws. `close()` is a
 * no-op when nothing is open, making it safe to call from event handlers that
 * may race (Esc + click-outside firing in close succession).
 */
class ExtensionsPanelState {
  private _isOpen = $state(false);

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public open(): void {
    if (this._isOpen) {
      throw new Error('Extensions panel already open');
    }
    if (quickPickState.current !== null) {
      throw new Error('Another modal overlay is open');
    }
    this._isOpen = true;
  }

  /** Replaces an open quick pick with the panel; keeps an open panel as it is. */
  public show(): void {
    quickPickState.dismiss();
    this._isOpen = true;
  }

  public close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
  }
}

export const extensionsPanelState = new ExtensionsPanelState();
