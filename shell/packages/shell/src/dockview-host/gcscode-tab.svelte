<script lang="ts">
  import { DefaultTab } from 'dockview-svelte';
  import type { IDockviewPanelHeaderProps } from 'dockview-core';

  // Receive the full dockview tab-header props shape and forward everything
  // to DefaultTab plus hideClose={true}. Extensions own panel lifecycle in
  // gcscode; users do not close panels.
  let props: IDockviewPanelHeaderProps = $props();
</script>

<DefaultTab {...props} hideClose={true} />
