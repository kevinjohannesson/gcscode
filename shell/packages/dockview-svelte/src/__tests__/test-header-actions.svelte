<script lang="ts">
  import type { IDockviewHeaderActionsProps } from 'dockview-core';

  const props: IDockviewHeaderActionsProps = $props();
  const groupId = $derived(props.group?.api?.id ?? 'unknown');
</script>

<div data-testid="header-actions" data-group={groupId}>actions</div>
