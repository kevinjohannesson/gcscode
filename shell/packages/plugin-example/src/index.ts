import type { Plugin } from '@gcscode/plugin-api';

import ExampleStatus from './example-status.svelte';
import ExampleView from './example-view.svelte';

export const examplePlugin: Plugin = {
  id: 'gcscode.example',
  displayName: 'Example Plugin',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'gcscode.example.main',
        component: ExampleView,
      }),
      context.host.registerStatusBarItem({
        id: 'gcscode.example.status',
        component: ExampleStatus,
        alignment: 'right',
      }),
      context.host.registerCommand({
        id: 'gcscode.example.greet',
        run: () => {
          const message = 'Hello from gcscode.example';
          console.log(message);
          return message;
        },
      }),
      context.host.registerKeybinding({
        key: 'Alt+Shift+G',
        command: 'gcscode.example.greet',
      }),
    );
  },
};
