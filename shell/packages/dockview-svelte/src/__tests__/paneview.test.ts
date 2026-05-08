import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { PaneviewApi } from 'dockview-core';

import PaneviewSvelte from '../paneview/paneview.svelte';
import type { IPaneviewSvelteProps } from '../paneview/types';
import TestPanel from './test-paneview-panel.svelte';

function renderPaneview(overrides: Partial<IPaneviewSvelteProps> = {}): {
  api: PaneviewApi;
  container: HTMLElement;
} {
  let capturedApi: PaneviewApi | undefined;
  const onReady = ({ api }: { api: PaneviewApi }) => {
    capturedApi = api;
  };
  const props: IPaneviewSvelteProps = {
    components: {},
    ...overrides,
    onReady,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = render(PaneviewSvelte as any, { props: props as any });
  if (!capturedApi) {
    throw new Error('onReady did not fire synchronously during render');
  }
  return { api: capturedApi, container: result.container };
}

describe('<PaneviewSvelte>', () => {
  it('renders and onReady fires with an api', () => {
    const { api } = renderPaneview();
    expect(api).toBeDefined();
    expect(typeof api.addPanel).toBe('function');
  });

  it('addPanel mounts the registered component', () => {
    const { api, container } = renderPaneview({
      components: { a: TestPanel as never },
    });

    api.addPanel({ id: 'p1', component: 'a', title: 'Hello', params: { title: 'Hello' } });
    flushSync();

    expect(container.querySelector('[data-testid="pane-panel"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="title"]')?.textContent).toBe('Hello');
  });

  it('updateParameters reactively updates without remount', () => {
    const onMounted = vi.fn<(mountId: string) => void>();
    const { api, container } = renderPaneview({
      components: { a: TestPanel as never },
    });

    const panel = api.addPanel({
      id: 'p1',
      component: 'a',
      title: 'A',
      params: { title: 'A', onMounted },
    });
    flushSync();

    const panelEl = container.querySelector('[data-testid="pane-panel"]') as HTMLElement;
    const mountIdBefore = panelEl.dataset.mountId;
    expect(mountIdBefore).toBeTruthy();

    panel.api.updateParameters({ title: 'X' });
    flushSync();

    const panelElAfter = container.querySelector('[data-testid="pane-panel"]') as HTMLElement;
    expect(panelElAfter).toBe(panelEl);
    expect(panelElAfter.querySelector('[data-testid="title"]')?.textContent).toBe('X');
    expect(panelElAfter.dataset.mountId).toBe(mountIdBefore);
    expect(onMounted).toHaveBeenCalledTimes(1);
  });
});
