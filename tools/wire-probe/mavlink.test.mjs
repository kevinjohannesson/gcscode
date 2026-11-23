import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES, concat } from './fixtures.mjs';
import { crc16, describe, parseFrames } from './mavlink.mjs';

test('the checksum is CRC-16/MCRF4XX: its check value for "123456789" is 0x6F91', () => {
  assert.equal(crc16(new TextEncoder().encode('123456789')), 0x6f91);
});

test('reads a MAVLink 2 heartbeat: sender, sequence and what it says', () => {
  const { frames, skipped } = parseFrames(FRAMES.heartbeatV2System2);
  assert.equal(skipped, 0);
  assert.equal(frames.length, 1);
  const [f] = frames;
  assert.deepEqual(
    {
      version: f.version,
      system: f.system,
      component: f.component,
      messageId: f.messageId,
      crcOk: f.crcOk,
    },
    { version: 2, system: 2, component: 1, messageId: 0, crcOk: true },
  );
  assert.deepEqual(describe(f), {
    message: 'HEARTBEAT',
    kind: 'heartbeat',
    target: null,
    detail: 'type 2 (quadrotor), autopilot 3 (ArduPilot), armed',
  });
});

test('reads a MAVLink 1 heartbeat', () => {
  const [f] = parseFrames(FRAMES.heartbeatV1System1).frames;
  assert.equal(f.version, 1);
  assert.equal(f.system, 1);
  assert.equal(describe(f).detail, 'type 2 (quadrotor), autopilot 3 (ArduPilot), disarmed');
});

test('reads a signed frame and steps over its signature', () => {
  const { frames, skipped } = parseFrames(
    concat(FRAMES.heartbeatSigned, FRAMES.heartbeatV2System2),
  );
  assert.equal(skipped, 0);
  assert.deepEqual(
    frames.map((f) => [f.system, f.component]),
    [
      [255, 190],
      [2, 1],
    ],
  );
  assert.equal(describe(frames[0]).detail, 'type 6 (ground station), autopilot 8 (none), disarmed');
});

test('names the system each command and control frame is sent to', () => {
  const shown = (bytes) => {
    const s = describe(parseFrames(bytes).frames[0]);
    return [s.message, s.kind, s.target, s.detail];
  };
  assert.deepEqual(shown(FRAMES.commandLongArmTo2), [
    'COMMAND_LONG',
    'command',
    2,
    'command 400 (COMPONENT_ARM_DISARM)',
  ]);
  assert.deepEqual(shown(FRAMES.commandIntTo0), [
    'COMMAND_INT',
    'command',
    0,
    'command 176 (DO_SET_MODE)',
  ]);
  assert.deepEqual(shown(FRAMES.ackTo255), [
    'COMMAND_ACK',
    'command',
    255,
    'command 400 (COMPONENT_ARM_DISARM), result 2 (denied)',
  ]);
  assert.deepEqual(shown(FRAMES.ackV1System3), [
    'COMMAND_ACK',
    'command',
    null,
    'command 22 (TAKEOFF), result 0 (accepted)',
  ]);
  assert.deepEqual(shown(FRAMES.manualTo1), [
    'MANUAL_CONTROL',
    'control',
    1,
    'x 100, y -200, z 500, r 0, buttons 0',
  ]);
  assert.deepEqual(shown(FRAMES.rcOverrideTo3), [
    'RC_CHANNELS_OVERRIDE',
    'control',
    3,
    'channels 1-8: 1500 1500 1000 1500 0 0 0 65535',
  ]);
});

test('a message the probe does not show is read but not described', () => {
  const [f] = parseFrames(FRAMES.attitudeSystem1).frames;
  assert.equal(f.messageId, 30);
  assert.equal(f.crcOk, undefined);
  assert.equal(describe(f), null);
});

test('several frames in one datagram are all read, in order', () => {
  const { frames } = parseFrames(
    concat(FRAMES.heartbeatV1System1, FRAMES.attitudeSystem1, FRAMES.heartbeatV2System2),
  );
  assert.deepEqual(
    frames.map((f) => [f.system, f.messageId]),
    [
      [1, 0],
      [1, 30],
      [2, 0],
    ],
  );
});

test('bytes before a frame are skipped and counted', () => {
  const { frames, skipped } = parseFrames(concat([0x00, 0x42, 0x13], FRAMES.heartbeatV2System2));
  assert.equal(frames.length, 1);
  assert.equal(skipped, 3);
});

test('a frame with a wrong checksum is not shown', () => {
  const bad = Uint8Array.from(FRAMES.heartbeatV2System2);
  bad[bad.length - 1] ^= 0xff;
  const { frames } = parseFrames(bad);
  assert.equal(frames.length, 0);
});

test('a frame cut short is not shown', () => {
  const { frames } = parseFrames(FRAMES.heartbeatV2System2.subarray(0, 15));
  assert.equal(frames.length, 0);
});

test('a start byte with too few bytes after it for a header is skipped', () => {
  assert.deepEqual(parseFrames(Uint8Array.from([0xfd, 0x09])), { frames: [], skipped: 2 });
  assert.deepEqual(parseFrames(Uint8Array.from([0xfe, 0x09, 0x00])), { frames: [], skipped: 3 });
});
