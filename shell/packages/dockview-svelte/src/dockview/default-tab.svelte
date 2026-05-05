<script lang="ts">
  import type { IDockviewPanelHeaderProps } from 'dockview-core';

  interface Props extends IDockviewPanelHeaderProps {
    hideClose?: boolean;
    closeActionOverride?: () => void;
  }

  let {
    api,
    containerApi: _containerApi,
    params: _params,
    tabLocation: _tabLocation,
    hideClose,
    closeActionOverride,
  }: Props = $props();

  // Subscribe reactively to the panel's title changes. The effect is keyed on
  // `api`, mirroring upstream React's `useEffect([api])` — re-subscription on
  // identity change is a no-op in practice (api is stable per panel) but keeps
  // the contract identical. The "catch up" branch handles upstream issue #1003
  // where effect ordering can briefly desync title from api.title.
  let title = $state<string | undefined>(undefined);

  $effect(() => {
    // Use a local binding to silence the `state_referenced_locally` warning
    // (the destructured `api` is captured by reference here, but the effect
    // re-runs whenever the `api` prop identity changes).
    const localApi = api;
    title = localApi.title;
    const disposable = localApi.onDidTitleChange((event) => {
      title = event.title;
    });
    return () => disposable.dispose();
  });

  // Tracks middle-mouse-button across pointerdown/pointerup so we can close
  // on middle-click-up (matching upstream React's `isMiddleMouseButton.current`
  // ref pattern). Not reactive; consumed only by event handlers.
  let isMiddleMouseButton = false;

  function onClose(event: Event) {
    event.preventDefault();
    if (closeActionOverride) {
      closeActionOverride();
    } else {
      api.close();
    }
  }

  function onBtnPointerDown(event: PointerEvent) {
    event.preventDefault();
  }

  function onPointerDown(event: PointerEvent) {
    isMiddleMouseButton = event.button === 1;
  }

  function onPointerUp(event: PointerEvent) {
    if (isMiddleMouseButton && event.button === 1 && !hideClose) {
      isMiddleMouseButton = false;
      onClose(event);
    }
  }

  function onPointerLeave() {
    isMiddleMouseButton = false;
  }
</script>

<!-- The element is a tab — mirrors upstream React's `<div className="dv-default-tab">`.
     A11y attributes (role/aria) are intentionally omitted to keep parity with
     upstream's DOM shape; dockview-core's CSS selectors target this exact class. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  data-testid="dockview-dv-default-tab"
  class="dv-default-tab"
  onpointerdown={onPointerDown}
  onpointerup={onPointerUp}
  onpointerleave={onPointerLeave}
>
  <span class="dv-default-tab-content">{title ?? ''}</span>
  {#if !hideClose}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="dv-default-tab-action" onpointerdown={onBtnPointerDown} onclick={onClose}>
      <svg
        height="11"
        width="11"
        viewBox="0 0 28 28"
        aria-hidden="false"
        focusable="false"
        class="dv-svg"
      >
        <path
          d="M2.1 27.3L0 25.2L11.55 13.65L0 2.1L2.1 0L13.65 11.55L25.2 0L27.3 2.1L15.75 13.65L27.3 25.2L25.2 27.3L13.65 15.75L2.1 27.3Z"
        ></path>
      </svg>
    </div>
  {/if}
</div>
