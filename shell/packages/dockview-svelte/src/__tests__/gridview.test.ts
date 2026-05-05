import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { Orientation, type GridviewApi } from 'dockview-core';

import GridviewSvelte from '../gridview/gridview.svelte';
import type { IGridviewSvelteProps } from '../gridview/types';
import TestPanel from './test-gridview-panel.svelte';

function renderGridview(
  overrides: Partial<IGridviewSvelteProps> = {},
): { api: GridviewApi; container: HTMLElement } {
  let capturedApi: GridviewApi | undefined;
  const onReady = ({ api }: { api: GridviewApi }) => {
    capturedApi = api;
  };
  const props: IGridviewSvelteProps = {
    components: {},
    orientation: Orientation.HORIZONTAL,
    ...overrides,
    onReady,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = render(GridviewSvelte as any, { props: props as any });
  if (!capturedApi) {
    throw new Error('onReady did not fire synchronously during render');
  }
  return { api: capturedApi, container: result.container };
}

describe('<GridviewSvelte>', () => {
  it('renders and onReady fires with an api', () => {
    const { api } = renderGridview();
    expect(api).toBeDefined();
    expect(typeof api.addPanel).toBe('function');
  });

  it('addPanel mounts the registered component', () => {
    const { api, container } = renderGridview({
      components: { a: TestPanel as never },
    });

    api.addPanel({ id: 'p1', component: 'a', params: { title: 'Hello' } });
    flushSync();

    expect(container.querySelector('[data-testid="grid-panel"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="title"]')?.textContent).toBe('Hello');
  });

  it('updateParameters reactively updates without remount', () => {
    const onMounted = vi.fn<(mountId: string) => void>();
    const { api, container } = renderGridview({
      components: { a: TestPanel as never },
    });

    const panel = api.addPanel({
      id: 'p1',
      component: 'a',
      params: { title: 'A', onMounted },
    });
    flushSync();

    const panelEl = container.querySelector('[data-testid="grid-panel"]') as HTMLElement;
    const mountIdBefore = panelEl.dataset.mountId;
    expect(mountIdBefore).toBeTruthy();

    panel.api.updateParameters({ title: 'X' });
    flushSync();

    const panelElAfter = container.querySelector('[data-testid="grid-panel"]') as HTMLElement;
    expect(panelElAfter).toBe(panelEl);
    expect(panelElAfter.querySelector('[data-testid="title"]')?.textContent).toBe('X');
    expect(panelElAfter.dataset.mountId).toBe(mountIdBefore);
    expect(onMounted).toHaveBeenCalledTimes(1);
  });
});
