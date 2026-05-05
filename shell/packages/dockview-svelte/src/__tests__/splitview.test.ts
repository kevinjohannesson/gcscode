import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SplitviewApi } from 'dockview-core';

import SplitviewSvelte from '../splitview/splitview.svelte';
import type { ISplitviewSvelteProps } from '../splitview/types';
import TestPanel from './test-splitview-panel.svelte';

function renderSplitview(
  overrides: Partial<ISplitviewSvelteProps> = {},
): { api: SplitviewApi; container: HTMLElement } {
  let capturedApi: SplitviewApi | undefined;
  const onReady = ({ api }: { api: SplitviewApi }) => {
    capturedApi = api;
  };
  const props: ISplitviewSvelteProps = {
    components: {},
    ...overrides,
    onReady,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = render(SplitviewSvelte as any, { props: props as any });
  if (!capturedApi) {
    throw new Error('onReady did not fire synchronously during render');
  }
  return { api: capturedApi, container: result.container };
}

describe('<SplitviewSvelte>', () => {
  it('renders and onReady fires with an api', () => {
    const { api } = renderSplitview();
    expect(api).toBeDefined();
    expect(typeof api.addPanel).toBe('function');
  });

  it('addPanel mounts the registered component', () => {
    const { api, container } = renderSplitview({
      components: { a: TestPanel as never },
    });

    api.addPanel({ id: 'p1', component: 'a', params: { title: 'Hello' } });
    flushSync();

    expect(container.querySelector('[data-testid="split-panel"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="title"]')?.textContent).toBe('Hello');
  });

  it('updateParameters reactively updates without remount', () => {
    const onMounted = vi.fn<(mountId: string) => void>();
    const { api, container } = renderSplitview({
      components: { a: TestPanel as never },
    });

    const panel = api.addPanel({
      id: 'p1',
      component: 'a',
      params: { title: 'A', onMounted },
    });
    flushSync();

    const panelEl = container.querySelector('[data-testid="split-panel"]') as HTMLElement;
    const mountIdBefore = panelEl.dataset.mountId;
    expect(mountIdBefore).toBeTruthy();
    expect(panelEl.querySelector('[data-testid="title"]')?.textContent).toBe('A');

    panel.api.updateParameters({ title: 'X' });
    flushSync();

    const panelElAfter = container.querySelector('[data-testid="split-panel"]') as HTMLElement;
    expect(panelElAfter).toBe(panelEl);
    expect(panelElAfter.querySelector('[data-testid="title"]')?.textContent).toBe('X');
    expect(panelElAfter.dataset.mountId).toBe(mountIdBefore);
    expect(onMounted).toHaveBeenCalledTimes(1);
  });
});
