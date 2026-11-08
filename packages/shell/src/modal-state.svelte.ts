/**
 * Tracks whether a modal-style overlay (currently: any quick pick) is open.
 * The keybinding dispatcher reads `active` and early-returns while it is
 * true, so the open overlay's own keyboard handling (Enter, Esc, ArrowUp /
 * ArrowDown, Ctrl+Shift+P) is not double-fired by the dispatcher.
 *
 * Modal stacking is not supported in v1 — at most one overlay sets this to
 * true at a time. The first overlap is caught by quickPickState's
 * "Quick pick already open" guard.
 */
class ModalState {
  private _active = $state(false);

  public get active(): boolean {
    return this._active;
  }
  public set active(value: boolean) {
    this._active = value;
  }
}

export const modalState = new ModalState();
