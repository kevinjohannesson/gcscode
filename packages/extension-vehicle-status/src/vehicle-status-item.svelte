<script lang="ts">
  import type { SitlExports } from '@gcscode/extension-sitl';

  import { getSitlExports } from './index';

  function fmtCoord(n: number | null): string {
    return n === null ? '—' : `${n.toFixed(2)}°`;
  }

  function formatSummary(exports: SitlExports | undefined): string {
    if (exports === undefined) return 'SITL: —';
    const t = exports.telemetry;
    if (t.connection === 'connecting') return 'SITL: connecting…';
    if (t.connection === 'disconnected') return 'SITL: disconnected';

    const parts: string[] = [t.mode ?? '—'];
    if (t.lat !== null && t.lng !== null) {
      parts.push(`${fmtCoord(t.lat)}/${fmtCoord(t.lng)}`);
    }
    if (t.batteryRemaining !== null) {
      parts.push(`${t.batteryRemaining}%`);
    }
    return `SITL: ${parts.join(' • ')}`;
  }

  const sitl = $derived(getSitlExports());
  const summary = $derived(formatSummary(sitl));
</script>

<span>{summary}</span>
