import { modalState } from '../modal-state.svelte';

/**
 * Owns the extensions-panel's open/closed state. At most one panel is open
 * at a time, AND the panel cannot open while any other modal overlay (the
 * quick pick) is open. Both guards mirror the existing quickPickState
 * pattern but with a simpler shape — the panel is a sustained interaction
 * surface, not a request-response, so there's no resolve callback.
 *
 * `open()` throws if already open OR if `modalState.active` is true (the
 * quick pick is open). `close()` is a no-op when nothing is open, making
 * it safe to call from event handlers that may race (Esc + click-outside +
 * re-pressed Ctrl+Shift+X all firing in close succession).
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
    if (modalState.active) {
      throw new Error('Another modal overlay is open');
    }
    this._isOpen = true;
  }

  public close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
  }
}

export const extensionsPanelState = new ExtensionsPanelState();
