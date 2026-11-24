// MAVLink frames encoded by pymavlink (MAVLink's reference Python
// implementation), not by this probe, so each expected value the tests take
// from them comes from outside the code under test.

const hex = (s) => Uint8Array.from(Buffer.from(s, 'hex'));
export const concat = (...parts) =>
  Uint8Array.from(Buffer.concat(parts.map((p) => Buffer.from(p))));

export const FRAMES = {
  // v2, system 2, quadrotor, ArduPilot, armed (base_mode 0x81)
  heartbeatV2System2: hex('fd0900000002010000000400000002038104037d8e'),
  // v1, system 1, quadrotor, ArduPilot, disarmed
  heartbeatV1System1: hex('fe09000101000000000002030103036e84'),
  // v2, signed, system 255 component 190, ground station
  heartbeatSigned: hex('fd09010000ffbe000000000000000608000403dab0000100000000002dbb9ec43681'),
  // COMPONENT_ARM_DISARM to system 2
  commandLongArmTo2: hex(
    'fd20000000ffbe4c00000000803f00000000000000000000000000000000000000000000000090010201faa1',
  ),
  // DO_SET_MODE to system 0 (every system); trailing zero bytes dropped by MAVLink 2
  commandIntTo0: hex(
    'fd1d000000ffbe4b00000000803f000080400000000000000000000000000000000000000000b09718',
  ),
  // COMMAND_ACK of COMPONENT_ARM_DISARM, denied, to system 255
  ackTo255: hex('fd0a00000001014d00009001020000000000ffbe90c8'),
  // v1 COMMAND_ACK of TAKEOFF, accepted, from system 3: v1 has no target field
  ackV1System3: hex('fe030003014d160000c87d'),
  // MANUAL_CONTROL to system 1: x 100, y -200, z 500, r 0, buttons 0
  manualTo1: hex('fd0b000000ffbe450000640038fff4010000000001fc61'),
  // RC_CHANNELS_OVERRIDE to system 3: channels 1-8 1500 1500 1000 1500 0 0 0 65535
  rcOverrideTo3: hex('fd12000000ffbe460000dc05dc05e803dc05000000000000ffff0301702c'),
  // ATTITUDE from system 1: a message the probe does not show
  attitudeSystem1: hex('fd1000000001011e0000e8030000cdcccc3dcdcc4c3e9a99993ef7d2'),
};
