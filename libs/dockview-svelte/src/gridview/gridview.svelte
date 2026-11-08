<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import {
    PROPERTY_KEYS_GRIDVIEW,
    createGridview,
    type GridviewApi,
    type GridviewFrameworkOptions,
    type GridviewOptions,
  } from 'dockview-core';
  import { SvelteGridviewPanelView } from './view';
  import type { IGridviewSvelteProps } from './types';

  let props: IGridviewSvelteProps = $props();

  let el: HTMLDivElement;
  let api: GridviewApi | undefined;

  function extractCoreOptions(p: IGridviewSvelteProps): GridviewOptions {
    return PROPERTY_KEYS_GRIDVIEW.reduce((obj, key) => {
      if (key in p) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any)[key] = p[key as keyof IGridviewSvelteProps];
      }
      return obj;
    }, {} as Partial<GridviewOptions>) as GridviewOptions;
  }

  function buildFrameworkOptions(): GridviewFrameworkOptions {
    return {
      createComponent: (options) => {
        const component = props.components[options.name];
        if (!component) {
          throw new Error(`gridview-svelte: no component registered for name '${options.name}'`);
        }
        return new SvelteGridviewPanelView(options.id, options.name, component);
      },
    };
  }

  onMount(() => {
    if (!el) throw new Error('gridview-svelte: element is not mounted');
    api = createGridview(el, {
      ...extractCoreOptions(props),
      ...buildFrameworkOptions(),
    });
    api.layout(el.clientWidth, el.clientHeight);
    props.onReady({ api });
  });

  onDestroy(() => {
    api?.dispose();
    api = undefined;
  });

  // Effect 1: per-key core option propagation.
  $effect(() => {
    const changes: Partial<GridviewOptions> = {};
    PROPERTY_KEYS_GRIDVIEW.forEach((key) => {
      if (key in props) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (changes as any)[key] = props[key as keyof IGridviewSvelteProps];
      }
    });
    untrack(() => {
      api?.updateOptions(changes);
    });
  });

  // Effect 2: components map → updateOptions({ createComponent }).
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    props.components;
    untrack(() => {
      api?.updateOptions({
        createComponent: (options) => {
          const component = props.components[options.name];
          if (!component) {
            throw new Error(`gridview-svelte: no component registered for name '${options.name}'`);
          }
          return new SvelteGridviewPanelView(options.id, options.name, component);
        },
      });
    });
  });
</script>

<div bind:this={el} style="height: 100%; width: 100%;"></div>
