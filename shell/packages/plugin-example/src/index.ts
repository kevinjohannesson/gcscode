import type { Plugin } from '@gcscode/plugin-api';

import ExampleView from './example-view.svelte';

export const examplePlugin: Plugin = {
  id: 'gcscode.example',
  displayName: 'Example Plugin',
  version: '0.0.0',
  activate(context) {
    const view = context.host.registerView({
      id: 'gcscode.example.main',
      component: ExampleView,
    });
    context.subscriptions.push(view);
  },
};
