import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { quickPickState } from './quick-pick-state.svelte';
import QuickPick from './quick-pick.svelte';

function openWithItems(
  items: { label: string }[],
  resolve: (v: { label: string } | undefined) => void = () => {},
) {
  quickPickState.open({ items, options: undefined, resolve });
}

describe('quick-pick.svelte', () => {
  afterEach(() => {
    quickPickState.dismiss();
  });

  it('renders all items when the input is empty', () => {
    openWithItems([{ label: 'Apple' }, { label: 'Banana' }, { label: 'Cherry' }]);
    render(QuickPick);
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.getByText('Cherry')).toBeInTheDocument();
  });

  it('filters items as the user types', async () => {
    openWithItems([{ label: 'Apple' }, { label: 'Banana' }, { label: 'Cherry' }]);
    render(QuickPick);
    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'ban' } });
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.queryByText('Cherry')).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    openWithItems([{ label: 'Apple' }]);
    render(QuickPick);
    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'zzzz' } });
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });

  it('Enter resolves the open promise with the highlighted item', async () => {
    const resolve = vi.fn();
    openWithItems([{ label: 'Apple' }, { label: 'Banana' }], resolve);
    render(QuickPick);
    const input = screen.getByRole('textbox');
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(resolve).toHaveBeenCalledWith({ label: 'Apple' });
  });

  it('Escape resolves the open promise with undefined', async () => {
    const resolve = vi.fn();
    openWithItems([{ label: 'Apple' }], resolve);
    render(QuickPick);
    const input = screen.getByRole('textbox');
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(resolve).toHaveBeenCalledWith(undefined);
  });

  it('ArrowDown then Enter picks the next item', async () => {
    const resolve = vi.fn();
    openWithItems([{ label: 'Apple' }, { label: 'Banana' }, { label: 'Cherry' }], resolve);
    render(QuickPick);
    const input = screen.getByRole('textbox');
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(resolve).toHaveBeenCalledWith({ label: 'Banana' });
  });

  it('clicking a row resolves the open promise with that row', async () => {
    const resolve = vi.fn();
    openWithItems([{ label: 'Apple' }, { label: 'Banana' }], resolve);
    render(QuickPick);
    await fireEvent.click(screen.getByText('Banana'));
    expect(resolve).toHaveBeenCalledWith({ label: 'Banana' });
  });

  it('uses the custom placeholder from options when provided', () => {
    quickPickState.open({
      items: [{ label: 'a' }],
      options: { placeholder: 'Custom placeholder text' },
      resolve: () => {},
    });
    render(QuickPick);
    expect(screen.getByPlaceholderText('Custom placeholder text')).toBeInTheDocument();
  });
});
