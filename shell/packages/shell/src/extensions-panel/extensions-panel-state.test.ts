import { afterEach, describe, expect, it } from 'vitest';

import { modalState } from '../modal-state.svelte';
import { extensionsPanelState } from './extensions-panel-state.svelte';

describe('extensionsPanelState', () => {
  afterEach(() => {
    extensionsPanelState.close();
    modalState.active = false;
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

  it('open() while modalState.active is true throws "Another modal overlay is open"', () => {
    modalState.active = true;
    expect(() => extensionsPanelState.open()).toThrow('Another modal overlay is open');
  });

  it('close() while not open is a no-op', () => {
    expect(() => extensionsPanelState.close()).not.toThrow();
    expect(extensionsPanelState.isOpen).toBe(false);
  });
});
