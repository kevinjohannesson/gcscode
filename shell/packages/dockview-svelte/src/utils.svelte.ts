import { mount, unmount, type Component } from 'svelte';
import {
  DockviewCompositeDisposable,
  DockviewMutableDisposable,
  type DockviewApi,
  type DockviewGroupLocation,
  type DockviewGroupPanel,
  type DockviewPanelApi,
  type GroupPanelPartInitParameters,
  type IContentRenderer,
  type IContextMenuItemComponentProps,
  type IContextMenuItemRenderer,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type IGroupHeaderProps,
  type IHeaderActionsRenderer,
  type ITabGroup,
  type ITabGroupChipRenderer,
  type ITabRenderer,
  type IWatermarkPanelProps,
  type IWatermarkRenderer,
  type PanelUpdateEvent,
  type Parameters,
  type TabPartInitParameters,
  type WatermarkRendererInitParameters,
} from 'dockview-core';
import { DOCKVIEW_CONTEXT_KEY, type DockviewSvelteContext } from './context';

/**
 * The handle returned by `mountSvelteComponent`. Mirrors upstream Vue's
 * `mountVueComponent` return shape (update + dispose). After `dispose()` is
 * called, `update()` becomes a noop — this matches React's
 * "resource is already disposed" semantics softened to be defensive (renderers
 * upstream call `dispose()` before any subsequent mutation, but cross-renderer
 * orderings are easier to reason about when `update()` after dispose is silent).
 */
export interface MountedComponent<P extends Record<string, unknown>> {
  update: (newProps: Partial<P>) => void;
  dispose: () => void;
}

/**
 * Mount a Svelte 5 component into a host element with reactive props.
 *
 * Three load-bearing details:
 *
 * 1. The props object is wrapped in `$state(...)` so that subsequent
 *    `Object.assign(reactiveProps, newProps)` calls (from `update()`)
 *    propagate to the rendered tree's `$props()` rune. With a plain object,
 *    `panel.api.updateParameters({ ... })` would silently fail to update.
 *    The file extension MUST be `.svelte.ts` for `$state` to compile.
 *
 * 2. Tear-down is via `unmount(instance)` (not `instance.$destroy()` — that
 *    API is gone in Svelte 5). Forgetting `unmount` leaks the reactive graph
 *    for the lifetime of the page.
 *
 * 3. Per-panel context flows via `mount({ context: Map })`, not `setContext()`
 *    in the host component. Each panel is a separately-mounted Svelte tree —
 *    `setContext` from the host is invisible to it. `mount`'s `context` option
 *    is also what makes popout windows work: when dockview-core re-parents
 *    the panel's DOM into a new browser window, the Svelte instance and its
 *    context map are unaffected.
 */
export function mountSvelteComponent<P extends Record<string, unknown>>(
  Component: Component<P>,
  initialProps: P,
  element: HTMLElement,
  context?: Map<unknown, unknown>,
): MountedComponent<P> {
  const reactiveProps = $state({ ...initialProps }) as P;

  // Cast through `Component<Record<string, unknown>>` because Svelte's
  // generic constraint on `mount` requires `{} extends P` to type-narrow
  // the `props` field. Our `P extends Record<string, unknown>` is strictly
  // narrower; the cast is sound at runtime.
  let instance: ReturnType<typeof mount> | undefined = mount(
    Component as Component<Record<string, unknown>>,
    {
      target: element,
      props: reactiveProps as Record<string, unknown>,
      context,
    },
  );

  let disposed = false;

  return {
    update(newProps) {
      if (disposed) {
        // After dispose(), updates become a noop. The renderer classes always
        // dispose before re-init, so this branch only triggers on out-of-order
        // calls — silently ignoring is the more defensive choice.
        return;
      }
      Object.assign(reactiveProps, newProps);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (instance) {
        unmount(instance);
        instance = undefined;
      }
    },
  };
}

/**
 * Base class for all Svelte renderers — owns the host `<div>` element that
 * dockview-core asks for. Mirrors upstream Vue's `AbstractVueRenderer`.
 */
abstract class AbstractSvelteRenderer {
  protected readonly _element: HTMLElement;

  get element(): HTMLElement {
    return this._element;
  }

  constructor(protected readonly component: Component<never>) {
    this._element = document.createElement('div');
    this._element.className = 'dv-svelte-part';
    this._element.style.height = '100%';
    this._element.style.width = '100%';
  }
}

/**
 * Used for both panel content (`IContentRenderer`) and tabs (`ITabRenderer`).
 * Both interfaces consume `TabPartInitParameters`-shaped data; the difference
 * is whether `tabLocation` is set.
 */
export class SvelteRenderer
  extends AbstractSvelteRenderer
  implements IContentRenderer, ITabRenderer
{
  private _renderDisposable: MountedComponent<Record<string, unknown>> | undefined;
  private _api: DockviewPanelApi | undefined;
  private _containerApi: DockviewApi | undefined;

  init(parameters: TabPartInitParameters): void {
    this._api = parameters.api;
    this._containerApi = parameters.containerApi;

    const props: IDockviewPanelHeaderProps = {
      params: parameters.params,
      api: parameters.api,
      containerApi: parameters.containerApi,
      tabLocation: parameters.tabLocation,
    };

    // The lint rule prefers SvelteMap for reactive maps; this map is passed
    // as the `mount({ context })` option and read once at construction by
    // descendant components — there is no reactive subscription path here.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const context = new Map<unknown, unknown>([
      [
        DOCKVIEW_CONTEXT_KEY,
        {
          api: parameters.api,
          containerApi: parameters.containerApi,
        } satisfies DockviewSvelteContext,
      ],
    ]);

    this._renderDisposable?.dispose();
    this._renderDisposable = mountSvelteComponent(
      this.component as Component<Record<string, unknown>>,
      props as unknown as Record<string, unknown>,
      this.element,
      context,
    );
  }

  update(event: PanelUpdateEvent<Parameters>): void {
    if (!this._api || !this._containerApi) {
      return;
    }
    // Mutate `params` (the user-supplied params bag) — the api / containerApi
    // are stable references already wired up at init.
    this._renderDisposable?.update({ params: event.params });
  }

  layout(_width: number, _height: number): void {
    // Layout is handled entirely by Svelte's reactive sizing on the host
    // element; we have nothing to imperatively recompute here.
  }

  dispose(): void {
    this._renderDisposable?.dispose();
  }
}

export class SvelteWatermarkRenderer extends AbstractSvelteRenderer implements IWatermarkRenderer {
  private _renderDisposable: MountedComponent<Record<string, unknown>> | undefined;

  init(parameters: WatermarkRendererInitParameters): void {
    const props: IWatermarkPanelProps = {
      group: parameters.group,
      containerApi: parameters.containerApi,
    };

    this._renderDisposable?.dispose();
    this._renderDisposable = mountSvelteComponent(
      this.component as Component<Record<string, unknown>>,
      props as unknown as Record<string, unknown>,
      this.element,
    );
  }

  update(_event: PanelUpdateEvent<Parameters>): void {
    // noop — watermark props are entirely derived from the container at init.
  }

  dispose(): void {
    this._renderDisposable?.dispose();
  }
}

export class SvelteHeaderActionsRenderer
  extends AbstractSvelteRenderer
  implements IHeaderActionsRenderer
{
  private _renderDisposable: MountedComponent<Record<string, unknown>> | undefined;
  private readonly _mutableDisposable = new DockviewMutableDisposable();
  private _baseProps: IGroupHeaderProps | undefined;

  constructor(
    component: Component<never>,
    private readonly group: DockviewGroupPanel,
  ) {
    super(component);
  }

  init(props: IGroupHeaderProps): void {
    this._baseProps = props;

    this._mutableDisposable.value = new DockviewCompositeDisposable(
      this.group.model.onDidAddPanel(() => this.updateProps()),
      this.group.model.onDidRemovePanel(() => this.updateProps()),
      this.group.model.onDidActivePanelChange(() => this.updateProps()),
      props.api.onDidActiveChange(() => this.updateProps()),
      props.api.onDidLocationChange((event) => this.updateLocation(event.location)),
    );

    this._renderDisposable?.dispose();
    this._renderDisposable = mountSvelteComponent(
      this.component as Component<Record<string, unknown>>,
      this.buildEnrichedProps() as unknown as Record<string, unknown>,
      this.element,
    );
  }

  dispose(): void {
    this._mutableDisposable.dispose();
    this._renderDisposable?.dispose();
  }

  private buildEnrichedProps(): IDockviewHeaderActionsProps {
    return {
      ...this._baseProps!,
      panels: this.group.model.panels,
      activePanel: this.group.model.activePanel,
      isGroupActive: this.group.api.isActive,
      group: this.group,
      headerPosition: this.group.model.headerPosition,
      location: this.group.api.location,
    };
  }

  private updateProps(): void {
    this._renderDisposable?.update(this.buildEnrichedProps() as unknown as Record<string, unknown>);
  }

  private updateLocation(location: DockviewGroupLocation): void {
    this._renderDisposable?.update({ location });
  }
}

export class SvelteContextMenuItemRenderer
  extends AbstractSvelteRenderer
  implements IContextMenuItemRenderer
{
  private _renderDisposable: MountedComponent<Record<string, unknown>> | undefined;

  init(props: IContextMenuItemComponentProps): void {
    this._renderDisposable?.dispose();
    this._renderDisposable = mountSvelteComponent(
      this.component as Component<Record<string, unknown>>,
      props as unknown as Record<string, unknown>,
      this.element,
    );
  }

  dispose(): void {
    this._renderDisposable?.dispose();
  }
}

export class SvelteTabGroupChipRenderer
  extends AbstractSvelteRenderer
  implements ITabGroupChipRenderer
{
  private _renderDisposable: MountedComponent<Record<string, unknown>> | undefined;

  constructor(component: Component<never>) {
    super(component);
    // Tab group chips render inline rather than filling the host — clear the
    // 100%/100% sizing the abstract base sets and switch to inline-flex so the
    // chip sits next to siblings in the tab strip. Mirrors upstream Vue.
    this.element.style.height = '';
    this.element.style.width = '';
    this.element.style.display = 'inline-flex';
  }

  init(params: { tabGroup: ITabGroup; api: DockviewApi }): void {
    this._renderDisposable?.dispose();
    this._renderDisposable = mountSvelteComponent(
      this.component as Component<Record<string, unknown>>,
      {
        tabGroup: params.tabGroup,
        api: params.api,
      } as Record<string, unknown>,
      this.element,
    );
  }

  update(params: { tabGroup: ITabGroup }): void {
    this._renderDisposable?.update({ tabGroup: params.tabGroup });
  }

  dispose(): void {
    this._renderDisposable?.dispose();
  }
}

/**
 * A generic, standalone "part" — used by Splitview / Gridview / Paneview view
 * classes (which mount Svelte components into a `dockview-core`-supplied
 * host element). Generic in the props type so each view flavor can pass its
 * own `IxxxPanelProps` shape. Constraint is `object` rather than
 * `Record<string, unknown>` so concrete interfaces (with fixed keys, no
 * index signature) satisfy it.
 */
export class SveltePart<P extends object = Record<string, unknown>> {
  private _renderDisposable: MountedComponent<Record<string, unknown>> | undefined;

  constructor(
    private readonly element: HTMLElement,
    private readonly component: Component<P>,
    private props: P,
    private readonly context?: Map<unknown, unknown>,
  ) {}

  init(): void {
    this._renderDisposable?.dispose();
    this._renderDisposable = mountSvelteComponent(
      this.component as Component<Record<string, unknown>>,
      this.props as unknown as Record<string, unknown>,
      this.element,
      this.context,
    );
  }

  update(props: Partial<P>): void {
    this.props = { ...this.props, ...props };
    this._renderDisposable?.update(props as Record<string, unknown>);
  }

  dispose(): void {
    this._renderDisposable?.dispose();
  }
}

// Re-export for the `<DockviewSvelte>` component to use without re-importing
// these symbols from `dockview-core` directly. Keeps the bridge file as the
// single point of contact between the Svelte side and dockview-core.
export type {
  IDockviewPanelProps,
  IDockviewPanelHeaderProps,
  IWatermarkPanelProps,
  IDockviewHeaderActionsProps,
  IGroupHeaderProps,
  GroupPanelPartInitParameters,
};
