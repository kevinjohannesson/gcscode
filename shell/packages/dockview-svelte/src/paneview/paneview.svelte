<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import {
    PROPERTY_KEYS_PANEVIEW,
    createPaneview,
    type PaneviewApi,
    type PaneviewFrameworkOptions,
    type PaneviewOptions,
  } from 'dockview-core';
  import { SveltePanePanelSection } from './view';
  import type { IPaneviewSvelteProps } from './types';

  let props: IPaneviewSvelteProps = $props();

  let el: HTMLDivElement;
  let api: PaneviewApi | undefined;

  function extractCoreOptions(p: IPaneviewSvelteProps): PaneviewOptions {
    return PROPERTY_KEYS_PANEVIEW.reduce((obj, key) => {
      if (key in p) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any)[key] = p[key as keyof IPaneviewSvelteProps];
      }
      return obj;
    }, {} as Partial<PaneviewOptions>) as PaneviewOptions;
  }

  function buildFrameworkOptions(): PaneviewFrameworkOptions {
    const headerComponents = props.headerComponents ?? {};
    return {
      createComponent: (options) => {
        const component = props.components[options.name];
        if (!component) {
          throw new Error(`paneview-svelte: no component registered for name '${options.name}'`);
        }
        return new SveltePanePanelSection(options.id, component);
      },
      createHeaderComponent: (options) => {
        const component = headerComponents[options.name];
        if (!component) return undefined;
        return new SveltePanePanelSection(options.id, component);
      },
    };
  }

  onMount(() => {
    if (!el) throw new Error('paneview-svelte: element is not mounted');
    api = createPaneview(el, {
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
    const changes: Partial<PaneviewOptions> = {};
    PROPERTY_KEYS_PANEVIEW.forEach((key) => {
      if (key in props) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (changes as any)[key] = props[key as keyof IPaneviewSvelteProps];
      }
    });
    untrack(() => {
      api?.updateOptions(changes);
    });
  });

  // Effect 2: components → updateOptions({ createComponent }).
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    props.components;
    untrack(() => {
      api?.updateOptions({
        createComponent: (options) => {
          const component = props.components[options.name];
          if (!component) {
            throw new Error(`paneview-svelte: no component registered for name '${options.name}'`);
          }
          return new SveltePanePanelSection(options.id, component);
        },
      });
    });
  });

  // Effect 3: headerComponents → updateOptions({ createHeaderComponent }).
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    props.headerComponents;
    untrack(() => {
      const headerComponents = props.headerComponents ?? {};
      api?.updateOptions({
        createHeaderComponent: (options) => {
          const component = headerComponents[options.name];
          if (!component) return undefined;
          return new SveltePanePanelSection(options.id, component);
        },
      });
    });
  });

  // Effect 4: onDidDrop subscription.
  $effect(() => {
    const handler = props.onDidDrop;
    if (!handler) return;
    if (!api) return;
    const disposable = api.onDidDrop((event) => handler(event));
    return () => disposable.dispose();
  });
</script>

<div bind:this={el} style="height: 100%; width: 100%;"></div>
