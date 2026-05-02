import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { modalState } from '../modal-state.svelte';
import { quickPickState } from './quick-pick-state.svelte';
import QuickPickHost from './quick-pick-host.svelte';

describe('quick-pick-host.svelte', () => {
  afterEach(() => {
    quickPickState.dismiss();
    modalState.active = false;
  });

  it('renders nothing when quickPickState.current is null', () => {
    render(QuickPickHost);
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('renders the QuickPick when a request opens, hides it when dismissed', async () => {
    render(QuickPickHost);
    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve: vi.fn(),
    });
    flushSync();
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    quickPickState.dismiss();
    flushSync();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('sets modalState.active true while open and false when closed', async () => {
    render(QuickPickHost);
    expect(modalState.active).toBe(false);

    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve: vi.fn(),
    });
    flushSync();
    expect(modalState.active).toBe(true);

    quickPickState.dismiss();
    flushSync();
    expect(modalState.active).toBe(false);
  });

  it('dismisses on click outside the panel', async () => {
    const resolve = vi.fn();
    render(QuickPickHost);
    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve,
    });
    flushSync();
    await fireEvent.click(document.body);
    expect(resolve).toHaveBeenCalledWith(undefined);
    expect(quickPickState.current).toBeNull();
  });

  it('does NOT dismiss on click inside the panel', async () => {
    const resolve = vi.fn();
    render(QuickPickHost);
    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve,
    });
    flushSync();
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    await fireEvent.click(dialog);
    expect(resolve).not.toHaveBeenCalled();
    expect(quickPickState.current).not.toBeNull();
  });
});
