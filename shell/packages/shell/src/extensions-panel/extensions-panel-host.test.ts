import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import { createExtensionManager } from '../extension-host/extension-manager';
import { createRegistry } from '../extension-host/registry';
import { modalState } from '../modal-state.svelte';
import ExtensionsPanelHost from './extensions-panel-host.svelte';
import { extensionsPanelState } from './extensions-panel-state.svelte';

function setup() {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  return { manager };
}

describe('extensions-panel-host.svelte', () => {
  afterEach(() => {
    extensionsPanelState.close();
    modalState.active = false;
  });

  it('renders nothing when extensionsPanelState.isOpen is false', () => {
    const { manager } = setup();
    render(ExtensionsPanelHost, { props: { manager } });
    expect(screen.queryByRole('dialog', { name: 'Extensions' })).not.toBeInTheDocument();
  });

  it('renders the ExtensionsPanel when state opens, hides it when closed', async () => {
    const { manager } = setup();
    render(ExtensionsPanelHost, { props: { manager } });

    extensionsPanelState.open();
    flushSync();
    expect(screen.getByRole('dialog', { name: 'Extensions' })).toBeInTheDocument();

    extensionsPanelState.close();
    flushSync();
    expect(screen.queryByRole('dialog', { name: 'Extensions' })).not.toBeInTheDocument();
  });

  it('sets modalState.active true while open and false when closed', () => {
    const { manager } = setup();
    render(ExtensionsPanelHost, { props: { manager } });
    expect(modalState.active).toBe(false);

    extensionsPanelState.open();
    flushSync();
    expect(modalState.active).toBe(true);

    extensionsPanelState.close();
    flushSync();
    expect(modalState.active).toBe(false);
  });

  it('click outside the dialog closes the panel', async () => {
    const { manager } = setup();
    render(ExtensionsPanelHost, { props: { manager } });

    extensionsPanelState.open();
    flushSync();
    expect(extensionsPanelState.isOpen).toBe(true);

    // A click on document.body (outside the dialog)
    await fireEvent.click(document.body);
    flushSync();
    expect(extensionsPanelState.isOpen).toBe(false);
  });

  it('click inside the dialog does NOT close the panel', async () => {
    const { manager } = setup();
    render(ExtensionsPanelHost, { props: { manager } });

    extensionsPanelState.open();
    flushSync();

    const dialog = screen.getByRole('dialog', { name: 'Extensions' });
    await fireEvent.click(dialog);
    flushSync();
    expect(extensionsPanelState.isOpen).toBe(true);
  });
});
