import { mount } from 'svelte';
import App from './app.svelte';
// @ts-expect-error - CSS side-effect import has no type declaration
import 'dockview-core/dist/styles/dockview.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('#app target not found');
}

mount(App, { target });
