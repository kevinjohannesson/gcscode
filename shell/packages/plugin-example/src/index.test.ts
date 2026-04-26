import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@gcscode/plugin-api';

import { examplePlugin } from './index';
import ExampleView from './example-view.svelte';

describe('examplePlugin', () => {
  it('declares stable identity metadata', () => {
    expect(examplePlugin.id).toBe('gcscode.example');
    expect(examplePlugin.displayName).toBe('Example Plugin');
    expect(typeof examplePlugin.version).toBe('string');
  });

  it('registers a view for ExampleView and pushes the disposable to subscriptions', () => {
    const fakeDisposable = { dispose: vi.fn() };
    const registerView = vi.fn().mockReturnValue(fakeDisposable);
    const registerStatusBarItem = vi.fn().mockReturnValue(fakeDisposable);
    const subscriptions: PluginContext['subscriptions'] = [];

    examplePlugin.activate({
      host: { registerView, registerStatusBarItem },
      subscriptions,
      plugin: {
        id: examplePlugin.id,
        displayName: examplePlugin.displayName,
        version: examplePlugin.version,
      },
    });

    expect(registerView).toHaveBeenCalledTimes(1);
    expect(registerView).toHaveBeenCalledWith({
      id: 'gcscode.example.main',
      component: ExampleView,
    });
    expect(subscriptions).toContain(fakeDisposable);
  });
});
