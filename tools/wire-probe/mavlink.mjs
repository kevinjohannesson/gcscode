// MAVLink framing, read straight from the bytes: no MAVLink library, so what
// the probe shows is what is on the wire, not what a library makes of it.
//
// It reads MAVLink 1 and 2 frames, checks the checksum of the messages it
// knows, and decodes only the fields the probe shows: who sent a frame, what
// it is, and for a command or control frame which system it names.

/** MAVLink 1 and 2 start bytes. */
const STX_V1 = 0xfe;
const STX_V2 = 0xfd;
/** MAVLink 2's incompatibility flag for a signed frame, which carries 13 more bytes. */
const SIGNED = 0x01;
const SIGNATURE_LENGTH = 13;

/**
 * The messages the probe shows, by message ID: the heartbeat, commands and
 * their answers, and control frames. `crcExtra` is the byte each message's
 * definition adds to its checksum (MAVLink's common.xml), without which a
 * frame's checksum cannot be checked.
 *
 * @type {Record<number, { name: string, kind: 'heartbeat' | 'command' | 'control', crcExtra: number }>}
 */
export const SHOWN = {
  0: { name: 'HEARTBEAT', kind: 'heartbeat', crcExtra: 50 },
  69: { name: 'MANUAL_CONTROL', kind: 'control', crcExtra: 243 },
  70: { name: 'RC_CHANNELS_OVERRIDE', kind: 'control', crcExtra: 124 },
  75: { name: 'COMMAND_INT', kind: 'command', crcExtra: 158 },
  76: { name: 'COMMAND_LONG', kind: 'command', crcExtra: 152 },
  77: { name: 'COMMAND_ACK', kind: 'command', crcExtra: 143 },
};

/**
 * MAVLink's checksum, CRC-16/MCRF4XX ("X.25"), over `bytes`, then `extra`.
 *
 * @param {Uint8Array} bytes
 * @param {number} [extra]
 */
export function crc16(bytes, extra) {
  let crc = 0xffff;
  const add = (b) => {
    let tmp = (b ^ crc) & 0xff;
    tmp = (tmp ^ (tmp << 4)) & 0xff;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
  };
  for (const b of bytes) add(b);
  if (extra !== undefined) add(extra);
  return crc;
}

/**
 * @typedef {object} Frame
 * @property {1 | 2} version
 * @property {number} sequence
 * @property {number} system the sender's system ID
 * @property {number} component the sender's component ID
 * @property {number} messageId
 * @property {Uint8Array} payload as sent: MAVLink 2 drops trailing zero bytes
 * @property {boolean | undefined} crcOk undefined for a message the probe does not know
 */

/**
 * Every whole frame in `bytes`, one UDP datagram. Bytes that do not start a
 * frame are skipped, as a MAVLink reader does, and counted.
 *
 * @param {Uint8Array} bytes
 * @returns {{ frames: Frame[], skipped: number }}
 */
export function parseFrames(bytes) {
  const frames = [];
  let skipped = 0;
  let i = 0;
  while (i < bytes.length) {
    const stx = bytes[i];
    const header = stx === STX_V2 ? 10 : stx === STX_V1 ? 6 : 0;
    if (header === 0 || i + header > bytes.length) {
      skipped++;
      i++;
      continue;
    }
    const length = bytes[i + 1];
    const signed = stx === STX_V2 && (bytes[i + 2] & SIGNED) !== 0;
    const end = i + header + length + 2 + (signed ? SIGNATURE_LENGTH : 0);
    if (end > bytes.length) {
      skipped++;
      i++;
      continue;
    }
    const v2 = stx === STX_V2;
    const messageId = v2 ? bytes[i + 7] | (bytes[i + 8] << 8) | (bytes[i + 9] << 16) : bytes[i + 5];
    const payload = bytes.subarray(i + header, i + header + length);
    const crcAt = i + header + length;
    const sent = bytes[crcAt] | (bytes[crcAt + 1] << 8);
    const known = SHOWN[messageId];
    const crcOk = known ? crc16(bytes.subarray(i + 1, crcAt), known.crcExtra) === sent : undefined;
    if (crcOk === false) {
      // A start byte inside some other data: move on one byte, as a reader would.
      skipped++;
      i++;
      continue;
    }
    frames.push({
      version: v2 ? 2 : 1,
      sequence: bytes[i + (v2 ? 4 : 2)],
      system: bytes[i + (v2 ? 5 : 3)],
      component: bytes[i + (v2 ? 6 : 4)],
      messageId,
      payload,
      crcOk,
    });
    i = end;
  }
  return { frames, skipped };
}

/** MAV_TYPE values a station is likely to meet. */
const VEHICLE_TYPES = {
  0: 'generic',
  1: 'fixed wing',
  2: 'quadrotor',
  4: 'helicopter',
  6: 'ground station',
  10: 'ground rover',
  13: 'hexarotor',
  14: 'octorotor',
  15: 'tricopter',
  19: 'VTOL',
  27: 'onboard controller',
};
/** MAV_AUTOPILOT values. */
const AUTOPILOTS = { 0: 'generic', 3: 'ArduPilot', 8: 'none', 12: 'PX4' };
/** MAV_CMD values a station sends early on. */
const COMMANDS = {
  20: 'RETURN_TO_LAUNCH',
  21: 'LAND',
  22: 'TAKEOFF',
  176: 'DO_SET_MODE',
  400: 'COMPONENT_ARM_DISARM',
  511: 'SET_MESSAGE_INTERVAL',
  512: 'REQUEST_MESSAGE',
};
/** MAV_RESULT values. */
const RESULTS = {
  0: 'accepted',
  1: 'temporarily rejected',
  2: 'denied',
  3: 'unsupported',
  4: 'failed',
  5: 'in progress',
  6: 'cancelled',
};

const named = (table, value) => (table[value] ? `${value} (${table[value]})` : String(value));

/**
 * @typedef {object} Shown a frame the probe shows, decoded
 * @property {string} message e.g. "HEARTBEAT"
 * @property {'heartbeat' | 'command' | 'control'} kind
 * @property {number | null} target the system a command or control frame names; null for a heartbeat,
 *   which names none, and 0 for a frame sent to every system
 * @property {string} detail what else it says, in words
 */

/**
 * The frame decoded, or null when the probe does not show it.
 *
 * @param {Frame} frame
 * @returns {Shown | null}
 */
export function describe(frame) {
  const known = SHOWN[frame.messageId];
  if (!known) return null;
  // MAVLink 2 drops a payload's trailing zero bytes: put them back before reading.
  const p = new Uint8Array(64);
  p.set(frame.payload.subarray(0, 64));
  const view = new DataView(p.buffer);
  const u16 = (at) => view.getUint16(at, true);
  const i16 = (at) => view.getInt16(at, true);
  const base = { message: known.name, kind: known.kind };

  switch (frame.messageId) {
    case 0: {
      const armed = (p[6] & 0x80) !== 0;
      return {
        ...base,
        target: null,
        detail: `type ${named(VEHICLE_TYPES, p[4])}, autopilot ${named(AUTOPILOTS, p[5])}, ${armed ? 'armed' : 'disarmed'}`,
      };
    }
    case 69:
      return {
        ...base,
        target: p[10],
        detail: `x ${i16(0)}, y ${i16(2)}, z ${i16(4)}, r ${i16(6)}, buttons ${u16(8)}`,
      };
    case 70: {
      const channels = Array.from({ length: 8 }, (_, k) => u16(2 * k));
      return { ...base, target: p[16], detail: `channels 1-8: ${channels.join(' ')}` };
    }
    case 75:
    case 76:
      return { ...base, target: p[30], detail: `command ${named(COMMANDS, u16(28))}` };
    case 77:
      return {
        ...base,
        // Its target is a MAVLink 2 extension field: a MAVLink 1 answer names no system.
        target: frame.version === 1 ? null : p[8],
        detail: `command ${named(COMMANDS, u16(0))}, result ${named(RESULTS, p[2])}`,
      };
  }
  return null;
}
