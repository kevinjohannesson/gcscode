import type { IPanePart, PanePanelComponentInitParameter, PanelUpdateEvent } from 'dockview-core';
import type { Component } from 'svelte';
import { SveltePart } from '../utils.svelte';
import { PANEVIEW_CONTEXT_KEY, type PaneviewSvelteContext } from '../context';
import type { IPaneviewPanelProps } from './types';

/**
 * Bridge between dockview-core's `IPanePart` (the per-pane interface for
 * paneview) and a user-supplied Svelte component. Mirrors upstream React's
 * `PanePanelSection`. Owns its own host element since `IPanePart` is not a
 * subclass of any `BasePanelView` (unlike Splitview/Gridview which extend
 * `SplitviewPanel`/`GridviewPanel`).
 */
export class SveltePanePanelSection implements IPanePart {
  private readonly _element: HTMLElement;
  private part?: SveltePart<IPaneviewPanelProps>;

  get element(): HTMLElement {
    return this._element;
  }

  constructor(
    public readonly id: string,
    private readonly svelteComponent: Component<IPaneviewPanelProps>,
  ) {
    this._element = document.createElement('div');
    this._element.style.height = '100%';
    this._element.style.width = '100%';
  }

  init(parameters: PanePanelComponentInitParameter): void {
    const props: IPaneviewPanelProps = {
      params: parameters.params as Record<string, unknown>,
      api: parameters.api,
      title: parameters.title,
      containerApi: parameters.containerApi,
    };

    const context = new Map<unknown, unknown>([
      [
        PANEVIEW_CONTEXT_KEY,
        {
          api: parameters.api,
          containerApi: parameters.containerApi,
        } satisfies PaneviewSvelteContext,
      ],
    ]);

    this.part = new SveltePart<IPaneviewPanelProps>(
      this._element,
      this.svelteComponent,
      props,
      context,
    );
    this.part.init();
  }

  toJSON(): object {
    return { id: this.id };
  }

  update(event: PanelUpdateEvent): void {
    // The paneview update path wraps params twice in upstream core (the
    // wrapper IFrameworkPart from PaneviewPanel.getComponent receives
    // `{params: <merged>}` and forwards `{params: {params: <merged>}}` to
    // the body/header parts — see paneviewPanel.ts:331-336 read alongside
    // basePanelView.ts:135). For Svelte we DON'T re-wrap (no equivalent
    // of Vue's `{params: {params, api, ...}}` outer slot), so we unwrap
    // once: `event.params.params` is the fully-merged user params bag.
    const userParams =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((event.params as any)?.params as Record<string, unknown>) ??
      (event.params as Record<string, unknown>);
    this.part?.update({ params: userParams });
  }

  dispose(): void {
    this.part?.dispose();
  }
}
