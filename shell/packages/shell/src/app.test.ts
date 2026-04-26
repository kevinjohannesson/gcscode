import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import type { Plugin } from '@gcscode/plugin-api';

import { createRegistry } from './plugin-host/registry';
import App from './app.svelte';
import MockContent from './__fixtures__/mock-content.svelte';
import MockLeft from './__fixtures__/mock-left.svelte';
import MockRight from './__fixtures__/mock-right.svelte';

function makePlugin(activate: Plugin['activate']): Plugin {
  return {
    id: 'test',
    displayName: 'Test',
    version: '0.0.0',
    activate,
  };
}

describe('app.svelte', () => {
  it('shows the empty state when no plugins are registered', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders every registered view', () => {
    const registry = createRegistry();
    registry.activate(
      makePlugin((ctx) => {
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
      makePlugin((ctx) => {
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
      makePlugin((ctx) => {
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
    const texts = Array.from(left.querySelectorAll('p, span')).map((el) => el.textContent);
    expect(texts).toEqual(['mock-left', 'mock-right']);
  });
});
