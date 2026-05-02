import { afterEach, describe, expect, it } from 'vitest';

import { modalState } from './modal-state.svelte';

describe('modalState', () => {
  afterEach(() => {
    // Reset shared singleton between tests so they don't pollute each other.
    modalState.active = false;
  });

  it('is inactive by default', () => {
    expect(modalState.active).toBe(false);
  });

  it('reflects writes through the public setter', () => {
    modalState.active = true;
    expect(modalState.active).toBe(true);
    modalState.active = false;
    expect(modalState.active).toBe(false);
  });
});
