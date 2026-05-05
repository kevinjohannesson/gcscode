<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import {
    PROPERTY_KEYS_SPLITVIEW,
    createSplitview,
    type SplitviewApi,
    type SplitviewFrameworkOptions,
    type SplitviewOptions,
  } from 'dockview-core';
  import { SvelteSplitviewPanelView } from './view';
  import type { ISplitviewSvelteProps } from './types';

  let props: ISplitviewSvelteProps = $props();

  let el: HTMLDivElement;
  let api: SplitviewApi | undefined;

  function extractCoreOptions(p: ISplitviewSvelteProps): SplitviewOptions {
    return PROPERTY_KEYS_SPLITVIEW.reduce((obj, key) => {
      if (key in p) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any)[key] = p[key as keyof ISplitviewSvelteProps];
      }
      return obj;
    }, {} as Partial<SplitviewOptions>) as SplitviewOptions;
  }

  function buildFrameworkOptions(): SplitviewFrameworkOptions {
    return {
      createComponent: (options) => {
        const component = props.components[options.name];
        if (!component) {
          throw new Error(`splitview-svelte: no component registered for name '${options.name}'`);
        }
        return new SvelteSplitviewPanelView(options.id, options.name, component);
      },
    };
  }

  onMount(() => {
    if (!el) throw new Error('splitview-svelte: element is not mounted');
    api = createSplitview(el, {
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
    const changes: Partial<SplitviewOptions> = {};
    PROPERTY_KEYS_SPLITVIEW.forEach((key) => {
      if (key in props) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (changes as any)[key] = props[key as keyof ISplitviewSvelteProps];
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
            throw new Error(
              `splitview-svelte: no component registered for name '${options.name}'`,
            );
          }
          return new SvelteSplitviewPanelView(options.id, options.name, component);
        },
      });
    });
  });
</script>

<div bind:this={el} style="height: 100%; width: 100%;"></div>
