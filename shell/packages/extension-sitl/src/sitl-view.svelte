<script lang="ts">
  import { telemetryState } from './telemetry-store.svelte';

  function fmtCoord(n: number | null): string {
    return n === null ? '—' : `${n.toFixed(6)}°`;
  }
  function fmtAlt(n: number | null): string {
    return n === null ? '—' : `${n.toFixed(2)} m`;
  }
  function fmtHeading(n: number | null): string {
    return n === null ? '—' : `${n.toFixed(1)}°`;
  }
  function fmtArmed(b: boolean | null): string {
    return b === null ? '—' : b ? 'ARMED' : 'disarmed';
  }
</script>

<section>
  <header>
    <h2>SITL Telemetry</h2>
    <span class="status {telemetryState.connection}">
      {telemetryState.connection}
    </span>
  </header>
  <dl>
    <dt>Mode</dt>
    <dd>{telemetryState.mode ?? '—'}</dd>
    <dt>Armed</dt>
    <dd>{fmtArmed(telemetryState.armed)}</dd>
    <dt>Latitude</dt>
    <dd>{fmtCoord(telemetryState.lat)}</dd>
    <dt>Longitude</dt>
    <dd>{fmtCoord(telemetryState.lng)}</dd>
    <dt>Altitude</dt>
    <dd>{fmtAlt(telemetryState.alt)}</dd>
    <dt>Heading</dt>
    <dd>{fmtHeading(telemetryState.heading)}</dd>
  </dl>
</section>
