<script lang="ts">
  import type { MavlinkExports } from '@gcscode/extension-mavlink';

  import { getMavlinkExports } from './index';

  function fmtCoord(n: number | null): string {
    return n === null ? '—' : `${n.toFixed(2)}°`;
  }

  function formatSummary(exports: MavlinkExports | undefined): string {
    if (exports === undefined) return 'MAVLink: —';
    const t = exports.telemetry;
    if (t.connection === 'connecting') return 'MAVLink: connecting…';
    if (t.connection === 'disconnected') return 'MAVLink: disconnected';

    const parts: string[] = [t.mode ?? '—'];
    if (t.lat !== null && t.lng !== null) {
      parts.push(`${fmtCoord(t.lat)}/${fmtCoord(t.lng)}`);
    }
    if (t.batteryRemaining !== null) {
      parts.push(`${t.batteryRemaining}%`);
    }
    return `MAVLink: ${parts.join(' • ')}`;
  }

  const mavlink = $derived(getMavlinkExports());
  const summary = $derived(formatSummary(mavlink));
</script>

<span>{summary}</span>
