import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import GcscodeTab from './gcscode-tab.svelte';

// Build a minimal mock IDockviewPanelHeaderProps shape — gcscode-tab only
// needs `api` (to read title + subscribe to changes) at runtime.
function makeApiMock(title: string) {
  return {
    title,
    onDidTitleChange: vi.fn(() => ({ dispose: vi.fn() })),
    close: vi.fn(),
  };
}

describe('gcscode-tab.svelte', () => {
  it('renders the title from api.title', () => {
    const api = makeApiMock('My Tab');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(GcscodeTab as any, { props: { api } as any });
    expect(container.textContent).toContain('My Tab');
  });

  it('does not render the close button', () => {
    const api = makeApiMock('My Tab');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(GcscodeTab as any, { props: { api } as any });
    // DefaultTab's close button is rendered with class .dv-default-tab-action.
    // hideClose suppresses it.
    expect(container.querySelector('.dv-default-tab-action')).toBeNull();
  });
});
