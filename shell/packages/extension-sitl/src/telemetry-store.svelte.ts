export interface TelemetryState {
  mode: string | null;
  armed: boolean | null;
  lat: number | null;
  lng: number | null;
  alt: number | null;
  heading: number | null;
  // new — ATTITUDE
  roll: number | null; // radians
  pitch: number | null; // radians
  yaw: number | null; // radians
  // new — VFR_HUD
  groundspeed: number | null; // m/s
  // new — SYS_STATUS
  voltageBattery: number | null; // V (from voltage_battery / 1000 mV)
  batteryRemaining: number | null; // %, null when MAVLink reports -1 (unknown)
  connection: 'connecting' | 'connected' | 'disconnected';
}

const ARDUCOPTER_MODES: Record<number, string> = {
  0: 'STABILIZE',
  1: 'ACRO',
  2: 'ALT_HOLD',
  3: 'AUTO',
  4: 'GUIDED',
  5: 'LOITER',
  6: 'RTL',
  7: 'CIRCLE',
  9: 'LAND',
  16: 'POSHOLD',
  17: 'BRAKE',
  20: 'GUIDED_NOGPS',
  21: 'SMART_RTL',
};

export const telemetryState: TelemetryState = $state({
  mode: null,
  armed: null,
  lat: null,
  lng: null,
  alt: null,
  heading: null,
  roll: null,
  pitch: null,
  yaw: null,
  groundspeed: null,
  voltageBattery: null,
  batteryRemaining: null,
  connection: 'connecting',
});

export function applyMessage(json: unknown): void {
  if (typeof json !== 'object' || json === null) return;
  const obj = json as Record<string, unknown>;
  if (typeof obj['message'] !== 'object' || obj['message'] === null) return;
  const msg = obj['message'] as Record<string, unknown>;
  if (typeof msg['type'] !== 'string') return;

  const type = msg['type'];

  if (type === 'HEARTBEAT') {
    const base_mode = typeof msg['base_mode'] === 'number' ? msg['base_mode'] : 0;
    const custom_mode = typeof msg['custom_mode'] === 'number' ? msg['custom_mode'] : 0;
    telemetryState.armed = (base_mode & 0x80) !== 0;
    telemetryState.mode = ARDUCOPTER_MODES[custom_mode] ?? `MODE_${custom_mode}`;
    return;
  }

  if (type === 'GLOBAL_POSITION_INT') {
    const lat = typeof msg['lat'] === 'number' ? msg['lat'] : null;
    const lon = typeof msg['lon'] === 'number' ? msg['lon'] : null;
    const relative_alt = typeof msg['relative_alt'] === 'number' ? msg['relative_alt'] : null;
    const hdg = typeof msg['hdg'] === 'number' ? msg['hdg'] : null;
    if (lat !== null) telemetryState.lat = lat / 1e7;
    if (lon !== null) telemetryState.lng = lon / 1e7;
    if (relative_alt !== null) telemetryState.alt = relative_alt / 1000;
    if (hdg !== null) telemetryState.heading = hdg / 100;
    return;
  }

  if (type === 'ATTITUDE') {
    if (typeof msg['roll'] === 'number') telemetryState.roll = msg['roll'];
    if (typeof msg['pitch'] === 'number') telemetryState.pitch = msg['pitch'];
    if (typeof msg['yaw'] === 'number') telemetryState.yaw = msg['yaw'];
    return;
  }

  if (type === 'VFR_HUD') {
    if (typeof msg['groundspeed'] === 'number') telemetryState.groundspeed = msg['groundspeed'];
    return;
  }

  if (type === 'SYS_STATUS') {
    if (typeof msg['voltage_battery'] === 'number') {
      telemetryState.voltageBattery = msg['voltage_battery'] / 1000;
    }
    if (typeof msg['battery_remaining'] === 'number') {
      telemetryState.batteryRemaining =
        msg['battery_remaining'] === -1 ? null : msg['battery_remaining'];
    }
    return;
  }

  // Unknown message type — silently ignored
}

export function setConnectionState(s: TelemetryState['connection']): void {
  telemetryState.connection = s;
}

export function reset(): void {
  telemetryState.mode = null;
  telemetryState.armed = null;
  telemetryState.lat = null;
  telemetryState.lng = null;
  telemetryState.alt = null;
  telemetryState.heading = null;
  telemetryState.roll = null;
  telemetryState.pitch = null;
  telemetryState.yaw = null;
  telemetryState.groundspeed = null;
  telemetryState.voltageBattery = null;
  telemetryState.batteryRemaining = null;
  telemetryState.connection = 'connecting';
}
