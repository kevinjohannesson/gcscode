<script lang="ts">
  import { SITL_LOCATION } from './location';
</script>

<section>
  <h2>SITL Stub</h2>
  <dl>
    <dt>Latitude</dt>
    <dd>{SITL_LOCATION.lat.toFixed(6)}°</dd>
    <dt>Longitude</dt>
    <dd>{SITL_LOCATION.lng.toFixed(6)}°</dd>
  </dl>
  <p>Hardcoded ArduPilot SITL default home. Real telemetry pending.</p>
</section>
