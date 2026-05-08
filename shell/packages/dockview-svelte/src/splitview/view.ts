import {
  SplitviewApi,
  SplitviewPanel,
  type IFrameworkPart,
  type PanelViewInitParameters,
} from 'dockview-core';
import type { Component } from 'svelte';
import { SveltePart } from '../utils.svelte';
import { SPLITVIEW_CONTEXT_KEY, type SplitviewSvelteContext } from '../context';
import type { ISplitviewPanelProps } from './types';

/**
 * Bridge between dockview-core's `SplitviewPanel` (the abstract panel base
 * for splitview) and a user-supplied Svelte component. Mirrors upstream
 * React's `ReactPanelView`.
 */
export class SvelteSplitviewPanelView extends SplitviewPanel {
  constructor(
    id: string,
    component: string,
    private readonly svelteComponent: Component<ISplitviewPanelProps>,
  ) {
    super(id, component);
  }

  getComponent(): IFrameworkPart {
    const params = this._params as PanelViewInitParameters | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accessor = (params as any)?.accessor;
    const containerApi = new SplitviewApi(accessor);

    const props: ISplitviewPanelProps = {
      params: (params?.params ?? {}) as Record<string, unknown>,
      api: this.api,
      containerApi,
    };

    const context = new Map<unknown, unknown>([
      [SPLITVIEW_CONTEXT_KEY, { api: this.api, containerApi } satisfies SplitviewSvelteContext],
    ]);

    const part = new SveltePart<ISplitviewPanelProps>(
      this.element,
      this.svelteComponent,
      props,
      context,
    );
    part.init();
    return part;
  }
}
