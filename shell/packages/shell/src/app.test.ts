import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { createRegistry } from './plugin-host/registry';
import App from './app.svelte';
import MockContent from './__fixtures__/mock-content.svelte';

describe('app.svelte', () => {
  it('shows the empty state when no plugins are registered', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders every registered view', () => {
    const registry = createRegistry();
    registry.activate({
      id: 'test',
      displayName: 'Test',
      version: '0.0.0',
      activate(ctx) {
        ctx.host.registerView({ id: 'test.view', component: MockContent });
      },
    });

    render(App, { props: { registry } });

    expect(screen.getByText('mock-content')).toBeInTheDocument();
  });
});
