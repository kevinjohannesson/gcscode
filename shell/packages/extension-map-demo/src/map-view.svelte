<script lang="ts">
  // Placeholder: real maplibre implementation lands in the next commit.
</script>

<div class="map-view">
  <h2 class="map-view__heading">Map (demo)</h2>
  <div class="map-view__placeholder">Map placeholder — maplibre lands in commit 2.</div>
</div>

<style>
  .map-view {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
  }
  .map-view__heading {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }
  .map-view__placeholder {
    width: 100%;
    height: 400px;
    background: #2a2a2a;
    color: #999;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }
</style>
