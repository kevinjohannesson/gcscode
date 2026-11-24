import { afterEach, describe, expect, it } from 'vitest';

import { quickPickState } from '../quick-pick/quick-pick-state.svelte';
import { extensionsPanelState } from './extensions-panel-state.svelte';

describe('extensionsPanelState', () => {
  afterEach(() => {
    extensionsPanelState.close();
    quickPickState.dismiss();
  });

  it('is closed by default', () => {
    expect(extensionsPanelState.isOpen).toBe(false);
  });

  it('open() flips isOpen to true', () => {
    extensionsPanelState.open();
    expect(extensionsPanelState.isOpen).toBe(true);
  });

  it('close() flips isOpen to false', () => {
    extensionsPanelState.open();
    extensionsPanelState.close();
    expect(extensionsPanelState.isOpen).toBe(false);
  });

  it('open() while already open throws "Extensions panel already open"', () => {
    extensionsPanelState.open();
    expect(() => extensionsPanelState.open()).toThrow('Extensions panel already open');
  });

  it('open() while a quick pick is open throws "Another modal overlay is open"', () => {
    quickPickState.open({ items: [], options: undefined, resolve: () => {} });
    expect(() => extensionsPanelState.open()).toThrow('Another modal overlay is open');
  });

  it('show() opens the panel', () => {
    extensionsPanelState.show();
    expect(extensionsPanelState.isOpen).toBe(true);
  });

  it('show() replaces an open quick pick, which resolves undefined', () => {
    const results: unknown[] = [];
    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve: (v) => results.push(v),
    });
    extensionsPanelState.show();
    expect(quickPickState.current).toBeNull();
    expect(results).toEqual([undefined]);
    expect(extensionsPanelState.isOpen).toBe(true);
  });

  it('show() while already open keeps it open and does not throw', () => {
    extensionsPanelState.show();
    expect(() => extensionsPanelState.show()).not.toThrow();
    expect(extensionsPanelState.isOpen).toBe(true);
  });

  it('close() while not open is a no-op', () => {
    expect(() => extensionsPanelState.close()).not.toThrow();
    expect(extensionsPanelState.isOpen).toBe(false);
  });
});
