/** MAV_COMP_ID_AUTOPILOT1: only the autopilot's heartbeat says whether the vehicle is armed. */
export const AUTOPILOT_COMPONENT_ID = 1;
/** MAV_MODE_FLAG_SAFETY_ARMED. */
const SAFETY_ARMED = 0x80;

export interface ArmedState {
  readonly systemId: number;
  readonly armed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * HEARTBEAT.base_mode as mavlink2rest may send it: a pipe-separated string of
 * flag names (what `extension-sitl` sees live), a number, or `{ bits: n }`.
 * Returns undefined when it can't tell.
 */
function armedFrom(baseMode: unknown): boolean | undefined {
  if (typeof baseMode === 'number' && Number.isInteger(baseMode))
    return (baseMode & SAFETY_ARMED) !== 0;
  if (typeof baseMode === 'string') return baseMode.includes('MAV_MODE_FLAG_SAFETY_ARMED');
  if (isRecord(baseMode) && typeof baseMode.bits === 'number')
    return (baseMode.bits & SAFETY_ARMED) !== 0;
  return undefined;
}

/** Whether an autopilot is armed, from its HEARTBEAT; undefined for anything else. */
export function parseArmedState(json: unknown): ArmedState | undefined {
  if (!isRecord(json) || !isRecord(json.header) || !isRecord(json.message)) return undefined;
  if (json.message.type !== 'HEARTBEAT') return undefined;
  const systemId = json.header.system_id;
  if (typeof systemId !== 'number' || !Number.isInteger(systemId) || systemId < 0) return undefined;
  if (json.header.component_id !== AUTOPILOT_COMPONENT_ID) return undefined;
  const armed = armedFrom(json.message.base_mode);
  return armed === undefined ? undefined : { systemId, armed };
}
