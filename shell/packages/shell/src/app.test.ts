import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Extension } from '@gcscode/extension-api';

import { createRegistry } from './extension-host/registry';
import { createExtensionManager, type ExtensionManager } from './extension-host/extension-manager';
import App from './app.svelte';
import MockContent from './__fixtures__/mock-content.svelte';
import MockLeft from './__fixtures__/mock-left.svelte';
import MockRight from './__fixtures__/mock-right.svelte';
import { quickPickState } from './quick-pick/quick-pick-state.svelte';
import { modalState } from './modal-state.svelte';
import { extensionsPanelState } from './extensions-panel/extensions-panel-state.svelte';

function makeExtension(activate: Extension['activate']): Extension {
  return {
    manifest: {
      id: 'test',
      displayName: 'Test',
      version: '0.0.0',
    },
    activate,
  };
}

describe('app.svelte', () => {
  it('shows the empty state when no extensions are registered', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    render(App, { props: { registry, manager } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders a dockview tab for every registered view', () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.host.window.registerView({
          id: 'test.view',
          component: MockContent,
          title: 'Test View',
        });
      }),
    );
    const manager = createExtensionManager(registry);

    render(App, { props: { registry, manager } });
    flushSync();

    const tabLabel = screen.getByText('Test View');
    expect(tabLabel).toBeInTheDocument();
  });

  it('renders the status bar even when no items are registered', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    render(App, { props: { registry, manager } });
    expect(screen.getByTestId('statusbar')).toBeInTheDocument();
  });

  it('places status bar items in the side that matches alignment', () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.host.window.registerStatusBarItem({
          id: 'test.left',
          component: MockLeft,
          alignment: 'left',
        });
        ctx.host.window.registerStatusBarItem({
          id: 'test.right',
          component: MockRight,
          alignment: 'right',
        });
      }),
    );
    const manager = createExtensionManager(registry);

    render(App, { props: { registry, manager } });

    const left = screen.getByTestId('statusbar-left');
    const right = screen.getByTestId('statusbar-right');
    expect(within(left).getByText('mock-left')).toBeInTheDocument();
    expect(within(right).getByText('mock-right')).toBeInTheDocument();
    expect(within(left).queryByText('mock-right')).not.toBeInTheDocument();
    expect(within(right).queryByText('mock-left')).not.toBeInTheDocument();
  });

  it('renders multiple items on the same side in registration order', () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.host.window.registerStatusBarItem({
          id: 'test.first',
          component: MockLeft,
          alignment: 'left',
        });
        ctx.host.window.registerStatusBarItem({
          id: 'test.second',
          component: MockRight,
          alignment: 'left',
        });
      }),
    );
    const manager = createExtensionManager(registry);

    render(App, { props: { registry, manager } });

    const left = screen.getByTestId('statusbar-left');
    const texts = Array.from(left.children).map((el) => el.textContent);
    expect(texts).toEqual(['mock-left', 'mock-right']);
  });

  it('reflects post-mount view registration as a new tab', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    render(App, { props: { registry, manager } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();

    registry.activate(
      makeExtension((ctx) => {
        ctx.host.window.registerView({
          id: 'late.view',
          component: MockContent,
          title: 'Late View',
        });
      }),
    );
    flushSync();

    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('Late View')).toBeInTheDocument();
  });

  it('reflects post-mount view deactivation by removing the tab', async () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.subscriptions.push(
          ctx.host.window.registerView({
            id: 'test.view',
            component: MockContent,
            title: 'Deactivatable',
          }),
        );
      }),
    );
    const manager = createExtensionManager(registry);
    render(App, { props: { registry, manager } });
    flushSync();
    expect(screen.getByText('Deactivatable')).toBeInTheDocument();

    await registry.deactivate('test');
    flushSync();

    expect(screen.queryByText('Deactivatable')).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('reflects post-mount status bar item registration on the matching side', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    render(App, { props: { registry, manager } });

    registry.activate(
      makeExtension((ctx) => {
        ctx.host.window.registerStatusBarItem({
          id: 'late.left',
          component: MockLeft,
          alignment: 'left',
        });
      }),
    );
    flushSync();

    const left = screen.getByTestId('statusbar-left');
    const right = screen.getByTestId('statusbar-right');
    expect(within(left).getByText('mock-left')).toBeInTheDocument();
    expect(within(right).queryByText('mock-left')).not.toBeInTheDocument();
  });
});

describe('app.svelte — quick pick integration', () => {
  afterEach(() => {
    quickPickState.dismiss();
    modalState.active = false;
  });

  it('renders the QuickPickHost and shows the palette when state opens', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    render(App, { props: { registry, manager } });
    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve: () => {},
    });
    flushSync();
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });
});

function makeNamedExtension(id: string, activate: Extension['activate']): Extension {
  return { manifest: { id, displayName: id, version: '0.0.0' }, activate };
}

function makeFailingExtension(id: string, message = 'boom'): Extension {
  return makeNamedExtension(id, () => {
    throw new Error(message);
  });
}

// `manager.register` reports a contained failure through `console.error`, so
// silence it around registration (same convention as `extensions-panel.test.ts`
// and `bootstrap.test.ts`) — a deliberate failure should not read as a broken
// test run.
function registerQuietly(manager: ExtensionManager, extensions: Extension[]): void {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const extension of extensions) manager.register(extension);
  } finally {
    consoleErrorSpy.mockRestore();
  }
}

function renderAppWith(extensions: Extension[]) {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  registerQuietly(manager, extensions);
  render(App, { props: { registry, manager } });
  return { registry, manager };
}

// jsdom does not let an exception thrown inside an event listener escape
// `dispatchEvent`; it reports it by firing an `error` event on `window`. So a
// regression in the indicator's open guard — which exists only to stop
// `extensionsPanelState.open()` from throwing — would be invisible to a plain
// `fireEvent.click` assertion. Collect those reports instead, and
// `preventDefault` so an expected-absent report would not also noise up the
// run's output. Verified to discriminate: removing the guard fails the two
// tests below.
function captureWindowErrors(): { readonly errors: ErrorEvent[]; stop: () => void } {
  const errors: ErrorEvent[] = [];
  function onError(event: ErrorEvent): void {
    event.preventDefault();
    errors.push(event);
  }
  window.addEventListener('error', onError);
  return { errors, stop: () => window.removeEventListener('error', onError) };
}

describe('app.svelte — activation-failure indicator', () => {
  afterEach(() => {
    extensionsPanelState.close();
    quickPickState.dismiss();
    modalState.active = false;
  });

  it('is host-owned: renders with no status-bar contribution registered', () => {
    const { registry } = renderAppWith([makeFailingExtension('x.bad')]);

    // The footer's `{#each}` blocks render only contributions. An
    // extension-contributed indicator would be subject to the failure it
    // reports, so this one must not be among them.
    expect(registry.listStatusBarItems()).toHaveLength(0);
    expect(screen.getByTestId('activation-failure-indicator')).toBeInTheDocument();
  });

  it('is absent when no extension failed', () => {
    renderAppWith([makeNamedExtension('ext.ok', () => {})]);

    expect(screen.queryByTestId('activation-failure-indicator')).not.toBeInTheDocument();
  });

  it('shows a singular count on the right-hand status side when one failed', () => {
    renderAppWith([makeFailingExtension('x.bad')]);

    const right = screen.getByTestId('statusbar-right');
    const indicator = within(right).getByTestId('activation-failure-indicator');
    expect(indicator).toHaveTextContent('1 extension failed');
  });

  it('pluralizes the count when more than one failed', () => {
    renderAppWith([makeFailingExtension('x.bad'), makeFailingExtension('y.bad')]);

    expect(screen.getByTestId('activation-failure-indicator')).toHaveTextContent(
      '2 extensions failed',
    );
  });

  it('counts exactly the records the panel marks failed, failed built-ins included', () => {
    renderAppWith([
      makeFailingExtension('workbench'),
      makeFailingExtension('x.bad'),
      makeNamedExtension('ext.ok', () => {}),
    ]);

    // Both numbers are asserted against the same literal rather than against
    // each other on purpose: comparing the two surfaces to one another would
    // pass if both were wrong in the same direction.
    expect(screen.getByTestId('activation-failure-indicator')).toHaveTextContent(
      '2 extensions failed',
    );

    extensionsPanelState.open();
    flushSync();

    expect(screen.getAllByTestId('extension-failure')).toHaveLength(2);
  });

  it('decrements as failed extensions are disabled, then disappears', async () => {
    const { manager } = renderAppWith([
      makeFailingExtension('x.bad'),
      makeFailingExtension('y.bad'),
    ]);
    expect(screen.getByTestId('activation-failure-indicator')).toHaveTextContent(
      '2 extensions failed',
    );

    await manager.setEnabled('x.bad', false);
    flushSync();
    expect(screen.getByTestId('activation-failure-indicator')).toHaveTextContent(
      '1 extension failed',
    );

    await manager.setEnabled('y.bad', false);
    flushSync();
    expect(screen.queryByTestId('activation-failure-indicator')).not.toBeInTheDocument();
  });

  it('opens the extensions panel when clicked', async () => {
    renderAppWith([makeFailingExtension('x.bad')]);
    expect(extensionsPanelState.isOpen).toBe(false);

    await fireEvent.click(screen.getByTestId('activation-failure-indicator'));
    flushSync();

    expect(extensionsPanelState.isOpen).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Extensions' })).toBeInTheDocument();
  });

  it('raises no error when clicked while the panel is already open', async () => {
    renderAppWith([makeFailingExtension('x.bad')]);
    extensionsPanelState.open();
    flushSync();

    const captured = captureWindowErrors();
    try {
      await fireEvent.click(screen.getByTestId('activation-failure-indicator'));
    } finally {
      captured.stop();
    }

    expect(captured.errors).toHaveLength(0);
    // Not re-opened, and in fact closed: the panel has no backdrop, so this
    // same click reaches the click-outside listener in `extensions-panel-host`.
    // Asserted so a future backdrop surfaces here rather than silently
    // changing what the indicator does. The guard's job is only the line above.
    expect(extensionsPanelState.isOpen).toBe(false);
  });

  it('raises no error and does not open the panel when clicked while a modal is open', async () => {
    renderAppWith([makeFailingExtension('x.bad')]);
    quickPickState.open({ items: [{ label: 'Apple' }], options: undefined, resolve: () => {} });
    flushSync();
    expect(modalState.active).toBe(true);

    const captured = captureWindowErrors();
    try {
      await fireEvent.click(screen.getByTestId('activation-failure-indicator'));
    } finally {
      captured.stop();
    }

    expect(captured.errors).toHaveLength(0);
    expect(extensionsPanelState.isOpen).toBe(false);
  });
});
