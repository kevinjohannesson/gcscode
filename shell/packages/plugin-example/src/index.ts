import type { Plugin } from '@gcscode/plugin-api';

import ExampleView from './example-view.svelte';

export const examplePlugin: Plugin = {
  activate(host) {
    host.registerContribution({ kind: 'content', component: ExampleView });
  },
};
