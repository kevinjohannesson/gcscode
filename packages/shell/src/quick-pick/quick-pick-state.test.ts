import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QuickPickItem } from '@gcscode/extension-api';

import { quickPickState } from './quick-pick-state.svelte';

describe('quickPickState', () => {
  afterEach(() => {
    // Drain any in-flight request so tests don't leak state.
    quickPickState.dismiss();
  });

  it('is empty by default', () => {
    expect(quickPickState.current).toBeNull();
  });

  it('open() with no current request stores the request', () => {
    const resolve = vi.fn();
    quickPickState.open({
      items: [{ label: 'a' }],
      options: undefined,
      resolve,
    });
    expect(quickPickState.current).not.toBeNull();
    expect(quickPickState.current?.items).toEqual([{ label: 'a' }]);
  });

  it('open() while already open throws "Quick pick already open"', () => {
    quickPickState.open({
      items: [{ label: 'a' }],
      options: undefined,
      resolve: vi.fn(),
    });
    expect(() =>
      quickPickState.open({
        items: [{ label: 'b' }],
        options: undefined,
        resolve: vi.fn(),
      }),
    ).toThrow('Quick pick already open');
  });

  it('pick(item) resolves the open promise with the item and clears current', () => {
    const resolve = vi.fn();
    const item: QuickPickItem = { label: 'chosen' };
    quickPickState.open({ items: [item], options: undefined, resolve });
    quickPickState.pick(item);
    expect(resolve).toHaveBeenCalledWith(item);
    expect(quickPickState.current).toBeNull();
  });

  it('dismiss() resolves the open promise with undefined and clears current', () => {
    const resolve = vi.fn();
    quickPickState.open({
      items: [{ label: 'a' }],
      options: undefined,
      resolve,
    });
    quickPickState.dismiss();
    expect(resolve).toHaveBeenCalledWith(undefined);
    expect(quickPickState.current).toBeNull();
  });

  it('pick() and dismiss() are no-ops when nothing is open', () => {
    expect(() => quickPickState.pick({ label: 'x' })).not.toThrow();
    expect(() => quickPickState.dismiss()).not.toThrow();
    expect(quickPickState.current).toBeNull();
  });
});
