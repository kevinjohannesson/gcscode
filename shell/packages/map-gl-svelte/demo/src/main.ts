import { mount } from 'svelte';
import 'maplibre-gl/dist/maplibre-gl.css';
import App from './app.svelte';

const target = document.getElementById('app');
if (!target) {
  throw new Error('#app target not found');
}

mount(App, { target });
