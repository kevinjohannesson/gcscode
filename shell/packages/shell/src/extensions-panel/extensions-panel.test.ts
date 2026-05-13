import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Extension, ExtensionContext, ViewContribution } from '@gcscode/extension-api';

import { createExtensionManager } from '../extension-host/extension-manager';
import { createRegistry } from '../extension-host/registry';
import { extensionsPanelState } from './extensions-panel-state.svelte';
import ExtensionsPanel from './extensions-panel.svelte';

const fakeComponent = {} as ViewContribution['component'];

function makeExtension(opts: {
  id: string;
  displayName?: string;
  version?: string;
  description?: string;
}): Extension {
  return {
    manifest: {
      id: opts.id,
      displayName: opts.displayName ?? opts.id,
      version: opts.version ?? '0.0.0',
      description: opts.description,
    },
    activate(ctx: ExtensionContext) {
      ctx.subscriptions.push(
        ctx.host.window.registerView({
          id: `${opts.id}.view`,
          component: fakeComponent,
          title: 'Test View',
        }),
      );
    },
  };
}

function setup(extensions: Extension[] = []) {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  for (const ext of extensions) manager.register(ext);
  return { registry, manager };
}

describe('extensions-panel.svelte', () => {
  afterEach(() => {
    extensionsPanelState.close();
  });

  it('renders one row per registered extension, EXCEPT workbench', () => {
    const { manager } = setup([
      makeExtension({ id: 'workbench', displayName: 'Workbench' }),
      makeExtension({ id: 'ext.a', displayName: 'Extension A' }),
      makeExtension({ id: 'ext.b', displayName: 'Extension B' }),
    ]);
    render(ExtensionsPanel, { props: { manager } });

    expect(screen.queryByText('Workbench')).not.toBeInTheDocument();
    expect(screen.getByText('Extension A')).toBeInTheDocument();
    expect(screen.getByText('Extension B')).toBeInTheDocument();
  });

  it('each row shows displayName, version, description, and matching button label', () => {
    const { manager } = setup([
      makeExtension({
        id: 'ext.a',
        displayName: 'Extension A',
        version: '1.2.3',
        description: 'A demo extension.',
      }),
    ]);
    render(ExtensionsPanel, { props: { manager } });

    expect(screen.getByText('Extension A')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    expect(screen.getByText('A demo extension.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
  });

  it('extension without a description renders no description block', () => {
    const { manager } = setup([
      makeExtension({ id: 'ext.a', displayName: 'Extension A' }), // no description
    ]);
    const { container } = render(ExtensionsPanel, { props: { manager } });

    expect(screen.queryByText('A demo extension.')).not.toBeInTheDocument();
    // The row should still render the name + version + button
    expect(screen.getByText('Extension A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    // No description-block element should be rendered
    const descriptions = container.querySelectorAll('.text-neutral-300');
    expect(descriptions.length).toBe(0);
  });

  it('disabled rows have lower opacity (opacity-60 class)', async () => {
    const { manager } = setup([makeExtension({ id: 'ext.a', displayName: 'Extension A' })]);
    await manager.setEnabled('ext.a', false);
    const { container } = render(ExtensionsPanel, { props: { manager } });

    const li = container.querySelector('li');
    expect(li?.classList.contains('opacity-60')).toBe(true);
  });

  it('search input filters rows via Fuse over displayName + description', async () => {
    const { manager } = setup([
      makeExtension({ id: 'ext.a', displayName: 'Apple', description: 'Red fruit.' }),
      makeExtension({ id: 'ext.b', displayName: 'Banana', description: 'Yellow fruit.' }),
      makeExtension({ id: 'ext.c', displayName: 'Cherry', description: 'Small red.' }),
    ]);
    render(ExtensionsPanel, { props: { manager } });

    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'banana' } });

    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.queryByText('Cherry')).not.toBeInTheDocument();
  });

  it('ArrowDown / ArrowUp wrap the highlight across visible rows', async () => {
    const { manager } = setup([
      makeExtension({ id: 'ext.a', displayName: 'Alpha' }),
      makeExtension({ id: 'ext.b', displayName: 'Bravo' }),
    ]);
    const { container } = render(ExtensionsPanel, { props: { manager } });

    const input = screen.getByRole('textbox');
    // Start: highlight is on row 0 (Alpha)
    expect(container.querySelectorAll('li')[0].classList.contains('bg-blue-900')).toBe(true);

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(container.querySelectorAll('li')[1].classList.contains('bg-blue-900')).toBe(true);

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Wraps to first row
    expect(container.querySelectorAll('li')[0].classList.contains('bg-blue-900')).toBe(true);

    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    // Wraps backward to last row
    expect(container.querySelectorAll('li')[1].classList.contains('bg-blue-900')).toBe(true);
  });

  it('Enter on highlighted row calls manager.setEnabled with the toggled value', async () => {
    const { manager } = setup([makeExtension({ id: 'ext.a', displayName: 'Alpha' })]);
    const setEnabled = vi.spyOn(manager, 'setEnabled');
    render(ExtensionsPanel, { props: { manager } });

    const input = screen.getByRole('textbox');
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(setEnabled).toHaveBeenCalledWith('ext.a', false); // currently enabled → toggle to false
  });

  it('clicking the Enable/Disable button calls manager.setEnabled', async () => {
    const { manager } = setup([makeExtension({ id: 'ext.a', displayName: 'Alpha' })]);
    const setEnabled = vi.spyOn(manager, 'setEnabled');
    render(ExtensionsPanel, { props: { manager } });

    const button = screen.getByRole('button', { name: 'Disable' });
    await fireEvent.click(button);

    expect(setEnabled).toHaveBeenCalledWith('ext.a', false);
  });

  it('renders "No extensions installed." when only workbench is registered', () => {
    const { manager } = setup([makeExtension({ id: 'workbench', displayName: 'Workbench' })]);
    render(ExtensionsPanel, { props: { manager } });

    expect(screen.getByText('No extensions installed.')).toBeInTheDocument();
    // No search input shown in the empty state
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders "No matching extensions." when search yields no matches', async () => {
    const { manager } = setup([makeExtension({ id: 'ext.a', displayName: 'Alpha' })]);
    render(ExtensionsPanel, { props: { manager } });

    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'zzzzz' } });

    expect(screen.getByText('No matching extensions.')).toBeInTheDocument();
  });

  it('Escape closes the panel via extensionsPanelState.close()', async () => {
    const { manager } = setup([makeExtension({ id: 'ext.a', displayName: 'Alpha' })]);
    extensionsPanelState.open();
    flushSync();
    render(ExtensionsPanel, { props: { manager } });

    const input = screen.getByRole('textbox');
    await fireEvent.keyDown(input, { key: 'Escape' });
    flushSync();

    expect(extensionsPanelState.isOpen).toBe(false);
  });
});
