import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import ViewHost from './view-host.svelte';
import MockContent from '../__fixtures__/mock-content.svelte';

describe('view-host.svelte', () => {
  it('renders the component passed via params.component', () => {
    // The view-host expects to be mounted by dockview, which passes panel
    // header props plus the params bag we set via addPanel. We mock just
    // the shape the component reads from.
    const params = { component: MockContent };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(ViewHost as any, { props: { params } as any });
    expect(screen.getByText('mock-content')).toBeInTheDocument();
  });

  it('renders nothing if no component is supplied in params', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(ViewHost as any, { props: { params: {} } as any });
    // No throw; nothing rendered.
    expect(container.textContent).toBe('');
  });
});
