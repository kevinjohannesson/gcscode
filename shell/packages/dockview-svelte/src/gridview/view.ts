import {
  GridviewApi,
  GridviewPanel,
  type GridviewComponent,
  type GridviewInitParameters,
  type IFrameworkPart,
} from 'dockview-core';
import type { Component } from 'svelte';
import { SveltePart } from '../utils.svelte';
import { GRIDVIEW_CONTEXT_KEY, type GridviewSvelteContext } from '../context';
import type { IGridviewPanelProps } from './types';

/**
 * Bridge between dockview-core's `GridviewPanel` and a user-supplied Svelte
 * component. Mirrors upstream React's `ReactGridPanelView`.
 */
export class SvelteGridviewPanelView extends GridviewPanel {
  constructor(
    id: string,
    component: string,
    private readonly svelteComponent: Component<IGridviewPanelProps>,
  ) {
    super(id, component);
  }

  getComponent(): IFrameworkPart {
    const params = this._params as GridviewInitParameters | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accessor = (params as any)?.accessor as GridviewComponent;
    const containerApi = new GridviewApi(accessor);

    const props: IGridviewPanelProps = {
      params: (params?.params ?? {}) as Record<string, unknown>,
      api: this.api,
      containerApi,
    };

    const context = new Map<unknown, unknown>([
      [GRIDVIEW_CONTEXT_KEY, { api: this.api, containerApi } satisfies GridviewSvelteContext],
    ]);

    const part = new SveltePart<IGridviewPanelProps>(
      this.element,
      this.svelteComponent,
      props,
      context,
    );
    part.init();
    return part;
  }
}
