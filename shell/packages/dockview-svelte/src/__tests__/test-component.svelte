<script lang="ts">
  import { getContext, onMount } from 'svelte';

  interface Props {
    title: string;
    onMounted?: (mountId: string) => void;
  }

  let { title, onMounted }: Props = $props();

  // mountId is a const captured at construction. If the component remounts,
  // it changes; if `update()` propagates without remount, it stays the same.
  const mountId = Math.random().toString(36).slice(2);
  onMount(() => onMounted?.(mountId));

  const contextValue = getContext<string | undefined>('test-key');
</script>

<div data-testid="title" data-mount-id={mountId}>{title}</div>
<div data-testid="context">{contextValue ?? '(none)'}</div>
