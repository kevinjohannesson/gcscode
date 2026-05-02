import type { QuickPickItem, QuickPickOptions } from '@gcscode/extension-api';

/**
 * The in-flight quick-pick request. The host component renders against this;
 * the resolve callback completes the promise that `host.window.showQuickPick`
 * returned to the caller.
 */
export interface QuickPickRequest<T extends QuickPickItem = QuickPickItem> {
  items: T[];
  options: QuickPickOptions | undefined;
  resolve: (value: T | undefined) => void;
}

/**
 * Owns the lifecycle of an open quick pick. At most one quick pick is open
 * at a time — the second concurrent open throws `Quick pick already open`.
 *
 * `pick(item)` resolves the open request with `item` and clears state.
 * `dismiss()` resolves with `undefined` and clears state. Both are no-ops
 * when nothing is open, making them safe to call from event handlers that
 * might race with each other (e.g. Esc + click-outside firing in close
 * succession).
 */
class QuickPickState {
  private _current = $state<QuickPickRequest | null>(null);

  public get current(): QuickPickRequest | null {
    return this._current;
  }

  public open<T extends QuickPickItem>(request: QuickPickRequest<T>): void {
    if (this._current !== null) {
      throw new Error('Quick pick already open');
    }
    this._current = request as unknown as QuickPickRequest;
  }

  public pick(item: QuickPickItem): void {
    if (this._current === null) return;
    this._current.resolve(item);
    this._current = null;
  }

  public dismiss(): void {
    if (this._current === null) return;
    this._current.resolve(undefined);
    this._current = null;
  }
}

export const quickPickState = new QuickPickState();
