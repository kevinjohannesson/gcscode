import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Extension, ExtensionContext, ViewContribution } from '@gcscode/extension-api';

import { WORKBENCH_EXTENSION_ID } from '../built-in/workbench';
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

// A failed record, produced through the real containment path rather than
// hand-built: `register` catches the throw and records `failure`, so the panel
// is rendered against exactly the record shape `extension-manager` produces.
function makeFailingExtension(opts: {
  id: string;
  displayName?: string;
  message?: string;
}): Extension {
  return {
    manifest: {
      id: opts.id,
      displayName: opts.displayName ?? opts.id,
      version: '0.0.0',
    },
    activate() {
      throw new Error(opts.message ?? 'boom');
    },
  };
}

// `register` reports a contained failure through `console.error`, so silence it
// around registration (same convention as `bootstrap.test.ts`) — a deliberate
// failure should not read as a broken test run.
function setupWithFailures(extensions: Extension[]) {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return setup(extensions);
  } finally {
    consoleErrorSpy.mockRestore();
  }
}

describe('extensions-panel.svelte', () => {
  afterEach(() => {
    extensionsPanelState.close();
  });

  it('renders one row per registered extension, EXCEPT workbench', () => {
    const { manager } = setup([
      makeExtension({ id: WORKBENCH_EXTENSION_ID, displayName: 'Workbench' }),
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
    const { manager } = setup([
      makeExtension({ id: WORKBENCH_EXTENSION_ID, displayName: 'Workbench' }),
    ]);
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

  describe('failed activation rows', () => {
    // Spec validation case 22.
    it('shows a failed row with its message and a reload hint', () => {
      const { manager } = setupWithFailures([
        makeFailingExtension({ id: 'x.bad', displayName: 'Bad', message: 'boom' }),
      ]);
      render(ExtensionsPanel, { props: { manager } });

      // Both halves of the spec's requirement: the failed STATE and the message.
      // "start", not "activate": the indicator's tooltip says the same, and
      // activation is our vocabulary rather than a drone operator's.
      expect(screen.getByText('Failed to start: boom')).toBeInTheDocument();
      // Reload is the only recovery path, so the hint has to state its cost —
      // an operator mid-flight is giving up live telemetry and video for it.
      expect(screen.getByText(/reload the app to try again/i)).toBeInTheDocument();
      expect(screen.getByText(/interrupts live telemetry and video/i)).toBeInTheDocument();
      // Reversible, not a kill switch.
      expect(screen.getByText(/until you turn it back on/i)).toBeInTheDocument();
    });

    it('marks only the failed row, leaving a healthy row unmarked', () => {
      const { manager } = setupWithFailures([
        makeExtension({ id: 'ext.ok', displayName: 'Healthy' }),
        makeFailingExtension({ id: 'x.bad', displayName: 'Bad', message: 'boom' }),
      ]);
      const { container } = render(ExtensionsPanel, { props: { manager } });

      // One block across two rows: the mark is conditional on `failure`, not
      // rendered on every row.
      expect(container.querySelectorAll('[data-testid="extension-failure"]').length).toBe(1);
      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });

    // Spec validation case 23.
    it('shows a failed workbench row with no Disable button', () => {
      const { manager } = setupWithFailures([
        makeFailingExtension({
          id: WORKBENCH_EXTENSION_ID,
          displayName: 'Workbench',
          message: 'palette gone',
        }),
      ]);
      render(ExtensionsPanel, { props: { manager } });

      expect(screen.getByText('Workbench')).toBeInTheDocument();
      expect(screen.getByText('Failed to start: palette gone')).toBeInTheDocument();
      // The qualification on the filter exception: disabling a failed workbench
      // would clear the `failure` that keeps the indicator — the operator's only
      // remaining way back into this panel — alive.
      expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
      // And the row must not advertise an action it deliberately does not offer.
      // The reload warning still applies here — this row's only recovery path
      // is the expensive one — but the disabling clause must not appear.
      expect(screen.getByText(/reload the app to try again/i)).toBeInTheDocument();
      expect(screen.getByText(/interrupts live telemetry and video/i)).toBeInTheDocument();
      expect(screen.queryByText(/disabling/i)).not.toBeInTheDocument();
    });

    // The row is reachable by keyboard as well as by mouse, and Enter toggles
    // the highlighted row. Removing the button alone would leave the operator
    // able to clear a failed workbench's `failure` — the exact outcome the
    // no-Disable qualification exists to prevent.
    it('Enter on a failed built-in row does not toggle it', async () => {
      const { manager } = setupWithFailures([
        makeFailingExtension({
          id: WORKBENCH_EXTENSION_ID,
          displayName: 'Workbench',
          message: 'palette gone',
        }),
      ]);
      const setEnabled = vi.spyOn(manager, 'setEnabled');
      render(ExtensionsPanel, { props: { manager } });

      const input = screen.getByRole('textbox');
      await fireEvent.keyDown(input, { key: 'Enter' });

      expect(setEnabled).not.toHaveBeenCalled();
    });

    // Pairs with the exception above: the guard that it stayed an exception for
    // FAILED built-ins rather than becoming "always list built-ins".
    it('still hides a healthy workbench', () => {
      const { manager } = setup([
        makeExtension({ id: WORKBENCH_EXTENSION_ID, displayName: 'Workbench' }),
      ]);
      render(ExtensionsPanel, { props: { manager } });

      expect(screen.queryByText('Workbench')).not.toBeInTheDocument();
    });
  });
});
