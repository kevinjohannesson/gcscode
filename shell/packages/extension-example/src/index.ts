import type { Extension } from '@gcscode/extension-api';

import ExampleStatus from './example-status.svelte';
import ExampleView from './example-view.svelte';

export const exampleExtension: Extension = {
  id: 'gcscode.example',
  displayName: 'Example Extension',
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
