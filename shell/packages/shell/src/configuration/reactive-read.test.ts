import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';

import { ConfigurationStore } from './configuration-store.svelte';
import ReactiveReadProbe from './__fixtures__/reactive-read-probe.svelte';

describe('reactive read', () => {
  it('a $derived over WorkspaceConfiguration.get() re-evaluates when update() fires', async () => {
    const store = new ConfigurationStore({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage);

    store.registerConfiguration(
      { key: 'ext.a.label', schema: { type: 'string' }, default: 'initial' },
      'ext.a',
    );

    render(ReactiveReadProbe, { props: { store } });
    expect(screen.getByTestId('label').textContent).toBe('initial');

    await store.getConfiguration('ext.a').update('label', 'updated');
    await tick();
    expect(screen.getByTestId('label').textContent).toBe('updated');
  });
});
