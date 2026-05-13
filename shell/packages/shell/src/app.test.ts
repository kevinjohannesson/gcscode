import { render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import type { Extension } from '@gcscode/extension-api';

import { createRegistry } from './extension-host/registry';
import { createExtensionManager } from './extension-host/extension-manager';
import App from './app.svelte';
import MockContent from './__fixtures__/mock-content.svelte';
import MockLeft from './__fixtures__/mock-left.svelte';
import MockRight from './__fixtures__/mock-right.svelte';
import { quickPickState } from './quick-pick/quick-pick-state.svelte';
import { modalState } from './modal-state.svelte';

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
