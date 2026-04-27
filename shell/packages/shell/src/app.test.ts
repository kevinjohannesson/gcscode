import { render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';

import type { Extension } from '@gcscode/extension-api';

import { createRegistry } from './extension-host/registry';
import App from './app.svelte';
import MockContent from './__fixtures__/mock-content.svelte';
import MockLeft from './__fixtures__/mock-left.svelte';
import MockRight from './__fixtures__/mock-right.svelte';

function makeExtension(activate: Extension['activate']): Extension {
  return {
    id: 'test',
    displayName: 'Test',
    version: '0.0.0',
    activate,
  };
}

describe('app.svelte', () => {
  it('shows the empty state when no extensions are registered', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders every registered view', () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.host.registerView({ id: 'test.view', component: MockContent });
      }),
    );

    render(App, { props: { registry } });

    expect(screen.getByText('mock-content')).toBeInTheDocument();
  });

  it('renders the status bar even when no items are registered', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });
    expect(screen.getByTestId('statusbar')).toBeInTheDocument();
  });

  it('places status bar items in the side that matches alignment', () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'test.left',
          component: MockLeft,
          alignment: 'left',
        });
        ctx.host.registerStatusBarItem({
          id: 'test.right',
          component: MockRight,
          alignment: 'right',
        });
      }),
    );

    render(App, { props: { registry } });

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
        ctx.host.registerStatusBarItem({
          id: 'test.first',
          component: MockLeft,
          alignment: 'left',
        });
        ctx.host.registerStatusBarItem({
          id: 'test.second',
          component: MockRight,
          alignment: 'left',
        });
      }),
    );

    render(App, { props: { registry } });

    const left = screen.getByTestId('statusbar-left');
    const texts = Array.from(left.children).map((el) => el.textContent);
    expect(texts).toEqual(['mock-left', 'mock-right']);
  });

  it('reflects post-mount view registration in the rendered UI', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();

    registry.activate(
      makeExtension((ctx) => {
        ctx.host.registerView({ id: 'late.view', component: MockContent });
      }),
    );
    flushSync();

    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('mock-content')).toBeInTheDocument();
  });

  it('reflects post-mount view deactivation in the rendered UI', () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.subscriptions.push(ctx.host.registerView({ id: 'test.view', component: MockContent }));
      }),
    );
    render(App, { props: { registry } });
    expect(screen.getByText('mock-content')).toBeInTheDocument();

    registry.deactivate('test');
    flushSync();

    expect(screen.queryByText('mock-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('reflects post-mount status bar item registration on the matching side', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });

    registry.activate(
      makeExtension((ctx) => {
        ctx.host.registerStatusBarItem({
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
