<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import {
    PROPERTY_KEYS_DOCKVIEW,
    createDockview,
    type ContextMenuItemConfig,
    type DockviewApi,
    type DockviewFrameworkOptions,
    type DockviewOptions,
  } from 'dockview-core';
  import {
    SvelteContextMenuItemRenderer,
    SvelteHeaderActionsRenderer,
    SvelteRenderer,
    SvelteTabGroupChipRenderer,
    SvelteWatermarkRenderer,
  } from '../utils.svelte';
  import type { IDockviewSvelteProps, SvelteContextMenuItemConfig } from './types';

  /**
   * Magic name under which `props.defaultTabComponent` is registered in our
   * local `frameworkTabComponents` map. Mirrors upstream React's
   * `DEFAULT_REACT_TAB = 'props.defaultTabComponent'` exactly.
   */
  const DEFAULT_SVELTE_TAB = 'props.defaultTabComponent';

  let props: IDockviewSvelteProps = $props();

  let el: HTMLDivElement;
  let api: DockviewApi | undefined;

  function extractCoreOptions(p: IDockviewSvelteProps): DockviewOptions {
    return PROPERTY_KEYS_DOCKVIEW.reduce((obj, key) => {
      if (key in p) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any)[key] = p[key as keyof IDockviewSvelteProps];
      }
      return obj;
    }, {} as Partial<DockviewOptions>) as DockviewOptions;
  }

  /**
   * Wrap the user's `getTabContextMenuItems` callback (which may return Svelte
   * components in `component`) into one returning core's expected shape — each
   * Svelte-component item gets registered under a generated id, and core's
   * `createContextMenuItemComponent` factory looks it up against this map.
   *
   * Mirrors upstream React's wrapping of the same callback.
   */
  function wrapContextMenuCallback<P extends { component: SvelteContextMenuItemConfig['component'] }>(
    register: (id: string, component: NonNullable<P['component']>) => void,
    cb: ((params: never) => (string | (Omit<P, 'component'> & { component?: P['component'] }))[]) | undefined,
  ):
    | ((params: never) => (string | ContextMenuItemConfig)[])
    | undefined {
    if (!cb) return undefined;
    return (params) => {
      const items = cb(params);
      return items.map((item) => {
        if (typeof item === 'string') return item;
        const { component, ...rest } = item;
        if (!component) return rest as ContextMenuItemConfig;
        const id = `dv-svelte-ctx-${Math.random().toString(36).slice(2)}`;
        register(id, component);
        return { ...rest, component: id } as ContextMenuItemConfig;
      });
    };
  }

  // Per-id Svelte component lookup for context menu items. The DockviewOptions
  // surface speaks core's by-id registry; the callback wrappers populate this
  // map and core's `createContextMenuItemComponent` reads it.
  const ctxComponentRegistry = new Map<
    string,
    NonNullable<SvelteContextMenuItemConfig['component']>
  >();

  function registerCtxComponent(
    id: string,
    component: NonNullable<SvelteContextMenuItemConfig['component']>,
  ) {
    ctxComponentRegistry.set(id, component);
  }

  function buildFrameworkOptions(): DockviewFrameworkOptions {
    const frameworkTabComponents: Record<string, IDockviewSvelteProps['defaultTabComponent']> = {
      ...(props.tabComponents ?? {}),
    };
    if (props.defaultTabComponent) {
      frameworkTabComponents[DEFAULT_SVELTE_TAB] = props.defaultTabComponent;
    }

    return {
      createComponent: (options) => {
        const component = props.components[options.name];
        if (!component) {
          throw new Error(`dockview-svelte: no component registered for name '${options.name}'`);
        }
        return new SvelteRenderer(component as never);
      },
      createTabComponent: (options) => {
        const component = frameworkTabComponents[options.name];
        if (!component) return undefined;
        return new SvelteRenderer(component as never);
      },
      createWatermarkComponent: props.watermarkComponent
        ? () => new SvelteWatermarkRenderer(props.watermarkComponent! as never)
        : undefined,
      createLeftHeaderActionComponent: props.leftHeaderActionsComponent
        ? (group) =>
            new SvelteHeaderActionsRenderer(props.leftHeaderActionsComponent! as never, group)
        : undefined,
      createRightHeaderActionComponent: props.rightHeaderActionsComponent
        ? (group) =>
            new SvelteHeaderActionsRenderer(props.rightHeaderActionsComponent! as never, group)
        : undefined,
      createPrefixHeaderActionComponent: props.prefixHeaderActionsComponent
        ? (group) =>
            new SvelteHeaderActionsRenderer(props.prefixHeaderActionsComponent! as never, group)
        : undefined,
      createContextMenuItemComponent: (options) => {
        const idOrComponent = options.component;
        const component =
          typeof idOrComponent === 'string'
            ? ctxComponentRegistry.get(idOrComponent)
            : (idOrComponent as NonNullable<SvelteContextMenuItemConfig['component']> | undefined);
        if (!component) return undefined;
        return new SvelteContextMenuItemRenderer(component as never);
      },
      defaultTabComponent: props.defaultTabComponent ? DEFAULT_SVELTE_TAB : undefined,
    };
  }

  onMount(() => {
    if (!el) {
      throw new Error('dockview-svelte: element is not mounted');
    }

    const coreOptions = extractCoreOptions(props);

    // Wrap context-menu callbacks if present.
    if (props.getTabContextMenuItems) {
      const wrapped = wrapContextMenuCallback(
        registerCtxComponent,
        props.getTabContextMenuItems as never,
      );
      coreOptions.getTabContextMenuItems = wrapped as DockviewOptions['getTabContextMenuItems'];
    }
    if (props.getTabGroupChipContextMenuItems) {
      const wrapped = wrapContextMenuCallback(
        registerCtxComponent,
        props.getTabGroupChipContextMenuItems as never,
      );
      coreOptions.getTabGroupChipContextMenuItems =
        wrapped as DockviewOptions['getTabGroupChipContextMenuItems'];
    }
    if (props.tabGroupChipComponent) {
      const chip = props.tabGroupChipComponent;
      coreOptions.createTabGroupChipComponent = () => new SvelteTabGroupChipRenderer(chip as never);
    }

    api = createDockview(el, {
      ...coreOptions,
      ...buildFrameworkOptions(),
    });
    api.layout(el.clientWidth, el.clientHeight);
    props.onReady({ api });
  });

  onDestroy(() => {
    api?.dispose();
    api = undefined;
  });

  // Effects mirror upstream React's per-prop useEffect blocks. Each one is
  // keyed on a dependency expression so it re-runs when (and only when) that
  // prop changes. We use `untrack` around `api` reads because the effects
  // should fire on prop changes, not on `api` being assigned during onMount.

  // 1. Core option keys (PROPERTY_KEYS_DOCKVIEW) → updateOptions for whichever changed.
  $effect(() => {
    // Subscribe to every property key. Reading them in the effect body is
    // what makes the effect track them.
    const changes: Partial<DockviewOptions> = {};
    PROPERTY_KEYS_DOCKVIEW.forEach((key) => {
      if (key in props) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (changes as any)[key] = props[key as keyof IDockviewSvelteProps];
      }
    });
    untrack(() => {
      api?.updateOptions(changes);
    });
  });

  // 2. tabGroupChipComponent → updateOptions({ createTabGroupChipComponent }).
  $effect(() => {
    const chip = props.tabGroupChipComponent;
    untrack(() => {
      api?.updateOptions({
        createTabGroupChipComponent: chip
          ? () => new SvelteTabGroupChipRenderer(chip as never)
          : undefined,
      });
    });
  });

  // 3. components → updateOptions({ createComponent }).
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    props.components;
    untrack(() => {
      api?.updateOptions({
        createComponent: (options) => {
          const component = props.components[options.name];
          if (!component) {
            throw new Error(
              `dockview-svelte: no component registered for name '${options.name}'`,
            );
          }
          return new SvelteRenderer(component as never);
        },
      });
    });
  });

  // 4. tabComponents | defaultTabComponent → updateOptions({ createTabComponent, defaultTabComponent }).
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    props.tabComponents;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    props.defaultTabComponent;
    untrack(() => {
      const frameworkTabComponents: Record<
        string,
        IDockviewSvelteProps['defaultTabComponent']
      > = { ...(props.tabComponents ?? {}) };
      if (props.defaultTabComponent) {
        frameworkTabComponents[DEFAULT_SVELTE_TAB] = props.defaultTabComponent;
      }
      api?.updateOptions({
        defaultTabComponent: props.defaultTabComponent ? DEFAULT_SVELTE_TAB : undefined,
        createTabComponent: (options) => {
          const component = frameworkTabComponents[options.name];
          if (!component) return undefined;
          return new SvelteRenderer(component as never);
        },
      });
    });
  });

  // 5. watermarkComponent → updateOptions({ createWatermarkComponent }).
  $effect(() => {
    const watermark = props.watermarkComponent;
    untrack(() => {
      api?.updateOptions({
        createWatermarkComponent: watermark
          ? () => new SvelteWatermarkRenderer(watermark as never)
          : undefined,
      });
    });
  });

  // 6. rightHeaderActionsComponent → updateOptions({ createRightHeaderActionComponent }).
  $effect(() => {
    const right = props.rightHeaderActionsComponent;
    untrack(() => {
      api?.updateOptions({
        createRightHeaderActionComponent: right
          ? (group) => new SvelteHeaderActionsRenderer(right as never, group)
          : undefined,
      });
    });
  });

  // 7. leftHeaderActionsComponent → updateOptions({ createLeftHeaderActionComponent }).
  $effect(() => {
    const left = props.leftHeaderActionsComponent;
    untrack(() => {
      api?.updateOptions({
        createLeftHeaderActionComponent: left
          ? (group) => new SvelteHeaderActionsRenderer(left as never, group)
          : undefined,
      });
    });
  });

  // 8. prefixHeaderActionsComponent → updateOptions({ createPrefixHeaderActionComponent }).
  $effect(() => {
    const prefix = props.prefixHeaderActionsComponent;
    untrack(() => {
      api?.updateOptions({
        createPrefixHeaderActionComponent: prefix
          ? (group) => new SvelteHeaderActionsRenderer(prefix as never, group)
          : undefined,
      });
    });
  });

  // 9. onDidDrop → subscribe via api.onDidDrop, dispose on cleanup.
  $effect(() => {
    const handler = props.onDidDrop;
    if (!handler) return;
    // We need to wait for `api` to exist; if not yet, the effect will be
    // re-evaluated when other state changes (or stays inert until then).
    if (!api) return;
    const disposable = api.onDidDrop((event) => handler(event));
    return () => disposable.dispose();
  });

  // 10. onWillDrop → subscribe via api.onWillDrop, dispose on cleanup.
  $effect(() => {
    const handler = props.onWillDrop;
    if (!handler) return;
    if (!api) return;
    const disposable = api.onWillDrop((event) => handler(event));
    return () => disposable.dispose();
  });

</script>

<div bind:this={el} style="height: 100%; width: 100%;"></div>
