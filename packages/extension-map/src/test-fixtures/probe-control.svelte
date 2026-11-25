<script lang="ts">
  import { getContext } from 'svelte';

  import { bridge, MAPLIBRE_CONTEXT_KEY } from './bridge-harness';

  // A component control that records whether the bridge's context reached it.
  bridge.controlContext = getContext(MAPLIBRE_CONTEXT_KEY);
</script>

<button type="button" class="probe-control">probe</button>
