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
  function fmtAttitude(rad: number | null): string {
    return rad === null ? '—' : `${((rad * 180) / Math.PI).toFixed(1)}°`;
  }
  function fmtSpeed(mps: number | null): string {
    return mps === null ? '—' : `${mps.toFixed(1)} m/s`;
  }
  function fmtVoltage(v: number | null): string {
    return v === null ? '—' : `${v.toFixed(2)} V`;
  }
  function fmtPercent(n: number | null): string {
    return n === null ? '—' : `${n}%`;
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
    <dt>Roll</dt>
    <dd>{fmtAttitude(telemetryState.roll)}</dd>
    <dt>Pitch</dt>
    <dd>{fmtAttitude(telemetryState.pitch)}</dd>
    <dt>Yaw</dt>
    <dd>{fmtAttitude(telemetryState.yaw)}</dd>
    <dt>Groundspeed</dt>
    <dd>{fmtSpeed(telemetryState.groundspeed)}</dd>
    <dt>Battery</dt>
    <dd>{fmtVoltage(telemetryState.voltageBattery)}</dd>
    <dt>Battery %</dt>
    <dd>{fmtPercent(telemetryState.batteryRemaining)}</dd>
  </dl>
</section>
