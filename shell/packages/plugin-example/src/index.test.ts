import { describe, expect, it, vi } from 'vitest';

import { examplePlugin } from './index';
import ExampleView from './example-view.svelte';

describe('examplePlugin.activate', () => {
  it("registers a 'content' contribution for ExampleView", () => {
    const registerContribution = vi.fn();

    examplePlugin.activate({ registerContribution });

    expect(registerContribution).toHaveBeenCalledTimes(1);
    expect(registerContribution).toHaveBeenCalledWith({
      kind: 'content',
      component: ExampleView,
    });
  });
});
