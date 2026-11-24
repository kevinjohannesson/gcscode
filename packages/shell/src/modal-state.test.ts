import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import { extensionsPanelState } from './extensions-panel/extensions-panel-state.svelte';
import { modalState } from './modal-state.svelte';
import { quickPickState } from './quick-pick/quick-pick-state.svelte';

function openQuickPick(): void {
  quickPickState.open({ items: [{ label: 'Apple' }], options: undefined, resolve: () => {} });
}

describe('modalState', () => {
  afterEach(() => {
    quickPickState.dismiss();
    extensionsPanelState.close();
  });

  it('is inactive by default', () => {
    expect(modalState.active).toBe(false);
  });

  it('is active while a quick pick is open', () => {
    openQuickPick();
    expect(modalState.active).toBe(true);
    quickPickState.dismiss();
    expect(modalState.active).toBe(false);
  });

  it('is active while the extensions panel is open', () => {
    extensionsPanelState.open();
    expect(modalState.active).toBe(true);
    extensionsPanelState.close();
    expect(modalState.active).toBe(false);
  });

  // The race this derivation removed: with each host writing the flag from its
  // own effect, the closing overlay's write could land after the opening one's.
  it('stays active when the extensions panel replaces the quick pick, and back', () => {
    openQuickPick();
    extensionsPanelState.show();
    flushSync();
    expect(quickPickState.current).toBeNull();
    expect(modalState.active).toBe(true);

    extensionsPanelState.close();
    openQuickPick();
    flushSync();
    expect(modalState.active).toBe(true);
  });
});

describe('modalState.allowWhileActive', () => {
  it('allows nothing by default', () => {
    expect(modalState.isAllowedWhileActive('some.command')).toBe(false);
  });

  it('allows a command until its disposable is disposed', () => {
    const allowed = modalState.allowWhileActive('some.command');
    expect(modalState.isAllowedWhileActive('some.command')).toBe(true);
    allowed.dispose();
    expect(modalState.isAllowedWhileActive('some.command')).toBe(false);
  });

  it('keeps a command allowed while any one of its registrations is live', () => {
    const first = modalState.allowWhileActive('some.command');
    const second = modalState.allowWhileActive('some.command');
    first.dispose();
    first.dispose(); // idempotent: must not release the second registration
    expect(modalState.isAllowedWhileActive('some.command')).toBe(true);
    second.dispose();
    expect(modalState.isAllowedWhileActive('some.command')).toBe(false);
  });
});
