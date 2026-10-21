import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Disposable } from '@gcscode/extension-api';
import type {
  AssetDescription,
  AssetSource,
  AssetsApi,
  RegisteredAsset,
} from '@gcscode/extension-assets';

import { airframeFromMavType, createAssetAdapter, systemIdOf } from './asset-adapter';

describe('airframeFromMavType', () => {
  it.each([
    ['MAV_TYPE_QUADROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_HEXAROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_OCTOROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_TRICOPTER', { kind: 'multirotor' }],
    ['MAV_TYPE_DECAROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_GENERIC_MULTIROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_FIXED_WING', { kind: 'fixed-wing' }],
    // Aspirational: this dialect still spells 23 `VTOL_RESERVED3`. The rule is
    // a prefix test, so it names the value under either spelling.
    ['MAV_TYPE_VTOL_TAILSITTER', { kind: 'vtol' }],
    ['MAV_TYPE_VTOL_TILTROTOR', { kind: 'vtol' }],
    ['MAV_TYPE_HELICOPTER', { kind: 'unknown' }],
    ['MAV_TYPE_GCS', { kind: 'none' }],
    ['MAV_TYPE_ANTENNA_TRACKER', { kind: 'none' }],
    ['MAV_TYPE_GIMBAL', { kind: 'none' }],
    ['MAV_TYPE_GROUND_ROVER', { kind: 'none' }],
    ['MAV_TYPE_SURFACE_BOAT', { kind: 'none' }],
    ['MAV_TYPE_SUBMARINE', { kind: 'none' }],
    ['MAV_TYPE_GROUND_QUADRUPED', { kind: 'none' }],
    ['MAV_TYPE_ODID', { kind: 'none' }],
    ['MAV_TYPE_BATTERY', { kind: 'none' }],
    ['MAV_TYPE_ILLUMINATOR', { kind: 'none' }],
    ['MAV_TYPE_GRIPPER', { kind: 'none' }],
    ['MAV_TYPE_SOMETHING_NEW', { kind: 'unknown' }],
  ])('maps %s', (input, expected) => {
    expect(airframeFromMavType(input)).toEqual(expected);
  });

  it('accepts the wrapped form mavlink2rest actually sends', () => {
    expect(airframeFromMavType({ type: 'MAV_TYPE_QUADROTOR' })).toEqual({ kind: 'multirotor' });
  });

  it('accepts the numeric form and agrees with the string form', () => {
    // 2 is MAV_TYPE_QUADROTOR.
    expect(airframeFromMavType(2)).toEqual(airframeFromMavType('MAV_TYPE_QUADROTOR'));
  });

  // Validation case 23 is a universal claim: "`MAV_TYPE` as an enum-name
  // string and as the equivalent number produce the same airframe". These are
  // every ordinal this module gives a word to. Ordinals and names are from
  // MAVLink's `minimal.xml` (where `MAV_TYPE` lives, not `common.xml`), read
  // out of the mavlink submodule of the ArduPilot checkout driving the SITL
  // this task measured against.
  it.each([
    [1, 'MAV_TYPE_FIXED_WING', { kind: 'fixed-wing' }],
    [2, 'MAV_TYPE_QUADROTOR', { kind: 'multirotor' }],
    [4, 'MAV_TYPE_HELICOPTER', { kind: 'unknown' }],
    [5, 'MAV_TYPE_ANTENNA_TRACKER', { kind: 'none' }],
    [6, 'MAV_TYPE_GCS', { kind: 'none' }],
    [10, 'MAV_TYPE_GROUND_ROVER', { kind: 'none' }],
    [11, 'MAV_TYPE_SURFACE_BOAT', { kind: 'none' }],
    [12, 'MAV_TYPE_SUBMARINE', { kind: 'none' }],
    [13, 'MAV_TYPE_HEXAROTOR', { kind: 'multirotor' }],
    [14, 'MAV_TYPE_OCTOROTOR', { kind: 'multirotor' }],
    [15, 'MAV_TYPE_TRICOPTER', { kind: 'multirotor' }],
    [18, 'MAV_TYPE_ONBOARD_CONTROLLER', { kind: 'none' }],
    [19, 'MAV_TYPE_VTOL_DUOROTOR', { kind: 'vtol' }],
    [20, 'MAV_TYPE_VTOL_QUADROTOR', { kind: 'vtol' }],
    [21, 'MAV_TYPE_VTOL_TILTROTOR', { kind: 'vtol' }],
    [22, 'MAV_TYPE_VTOL_RESERVED2', { kind: 'vtol' }],
    [23, 'MAV_TYPE_VTOL_RESERVED3', { kind: 'vtol' }],
    [24, 'MAV_TYPE_VTOL_RESERVED4', { kind: 'vtol' }],
    [25, 'MAV_TYPE_VTOL_RESERVED5', { kind: 'vtol' }],
    [26, 'MAV_TYPE_GIMBAL', { kind: 'none' }],
    [27, 'MAV_TYPE_ADSB', { kind: 'none' }],
    [29, 'MAV_TYPE_DODECAROTOR', { kind: 'multirotor' }],
    [30, 'MAV_TYPE_CAMERA', { kind: 'none' }],
    [31, 'MAV_TYPE_CHARGING_STATION', { kind: 'none' }],
    [32, 'MAV_TYPE_FLARM', { kind: 'none' }],
    [33, 'MAV_TYPE_SERVO', { kind: 'none' }],
    [34, 'MAV_TYPE_ODID', { kind: 'none' }],
    [35, 'MAV_TYPE_DECAROTOR', { kind: 'multirotor' }],
    [36, 'MAV_TYPE_BATTERY', { kind: 'none' }],
    [38, 'MAV_TYPE_LOG', { kind: 'none' }],
    [39, 'MAV_TYPE_OSD', { kind: 'none' }],
    [40, 'MAV_TYPE_IMU', { kind: 'none' }],
    [41, 'MAV_TYPE_GPS', { kind: 'none' }],
    [42, 'MAV_TYPE_WINCH', { kind: 'none' }],
    [43, 'MAV_TYPE_GENERIC_MULTIROTOR', { kind: 'multirotor' }],
    [44, 'MAV_TYPE_ILLUMINATOR', { kind: 'none' }],
    [46, 'MAV_TYPE_GROUND_QUADRUPED', { kind: 'none' }],
    [47, 'MAV_TYPE_VTOL_GYRODYNE', { kind: 'vtol' }],
    [48, 'MAV_TYPE_GRIPPER', { kind: 'none' }],
  ])('maps ordinal %i and %s to %o, in both forms', (ordinal, name, expected) => {
    // Both forms are asserted against the literal rather than against each
    // other. An equivalence check alone cannot catch a wrong *shared* answer:
    // the numeric path resolves the ordinal to a name and then runs the same
    // rules, so both sides agree on the same mistake. A value covered only by
    // equivalence is therefore untested for correctness — dropping CAMERA from
    // the non-flying rule once left the whole suite green. Anyone adding a
    // family member should add its expected answer here, not just a pair.
    // Case 23's equivalence claim follows from the two absolute assertions.
    expect(airframeFromMavType(name)).toEqual(expected);
    expect(airframeFromMavType(ordinal)).toEqual(expected);
  });

  // A number the vehicle sent IS an assertion, even when this module has no
  // word for it. `undefined` would claim nobody asserted an airframe — the
  // quiet failure the spec's parse rule exists to prevent. 3 is
  // MAV_TYPE_COAXIAL; 45 is MAV_TYPE_SPACECRAFT_ORBITER; 200 is not assigned.
  // None of the three is a value the mapping's stated rules give a word to.
  // (48 stood here until the non-flying family rule grew to name GRIPPER.)
  it.each([3, 45, 200])('reports a readable but unnamed ordinal %i as unknown', (ordinal) => {
    expect(airframeFromMavType(ordinal)).toEqual({ kind: 'unknown' });
  });

  // The residue, and the spec's evidence that the two family rules are
  // *complete* rather than merely wider: after both, exactly these eleven
  // values remain, and `unknown` is honest for every one — airborne craft
  // gcscode has no word for, the deliberately unspecific GENERIC, and the
  // rotary-wing pair. This pins the over-widening direction, which nothing
  // else tests: a family rule that grew to swallow an AIRSHIP would fail here.
  // It cannot detect the dialect gaining a value — this list is as static as
  // the module's — so it pins the partition as of the pinned dialect, not for
  // all time.
  it.each([
    'MAV_TYPE_GENERIC',
    'MAV_TYPE_COAXIAL',
    'MAV_TYPE_HELICOPTER',
    'MAV_TYPE_AIRSHIP',
    'MAV_TYPE_FREE_BALLOON',
    'MAV_TYPE_ROCKET',
    'MAV_TYPE_FLAPPING_WING',
    'MAV_TYPE_KITE',
    'MAV_TYPE_PARAFOIL',
    'MAV_TYPE_PARACHUTE',
    'MAV_TYPE_SPACECRAFT_ORBITER',
  ])('leaves %s in the residue, where unknown is the honest answer', (name) => {
    expect(airframeFromMavType(name)).toEqual({ kind: 'unknown' });
  });

  it('never reports a readable ordinal as unasserted', () => {
    for (let ordinal = 0; ordinal <= 48; ordinal++) {
      expect(airframeFromMavType(ordinal), `ordinal ${ordinal}`).toBeDefined();
    }
  });

  it('returns undefined — not unknown — when the value is unreadable', () => {
    expect(airframeFromMavType(undefined)).toBeUndefined();
    expect(airframeFromMavType(null)).toBeUndefined();
    expect(airframeFromMavType({})).toBeUndefined();
  });

  it('returns undefined for a wrapper whose type is not a string', () => {
    expect(airframeFromMavType({ type: 2 })).toBeUndefined();
    expect(airframeFromMavType({ type: null })).toBeUndefined();
  });

  it('returns undefined for numbers outside the enum space', () => {
    // An enum ordinal is a non-negative integer. A fractional or negative
    // number is malformed, not an assertion gcscode cannot name.
    expect(airframeFromMavType(Number.NaN)).toBeUndefined();
    expect(airframeFromMavType(2.5)).toBeUndefined();
    expect(airframeFromMavType(-1)).toBeUndefined();
    expect(airframeFromMavType(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('returns undefined for values that are not a readable MAV_TYPE', () => {
    expect(airframeFromMavType(true)).toBeUndefined();
    expect(airframeFromMavType('')).toBeUndefined();
    expect(airframeFromMavType([])).toBeUndefined();
  });
});

describe('systemIdOf', () => {
  it('reads the envelope header', () => {
    expect(systemIdOf({ header: { system_id: 7 }, message: { type: 'HEARTBEAT' } })).toBe('7');
  });

  it('reads the live frame shape measured on 2026-10-21', () => {
    // Captured from ws://localhost:8088/v1/ws/mavlink?filter=^HEARTBEAT$ —
    // ArduPilot SITL -> MAVProxy -> mavlink2rest. Trimmed to the two fields
    // this module reads; the rest of the message is telemetry-store's job.
    const frame = {
      header: { system_id: 1, component_id: 1, sequence: 249 },
      message: {
        type: 'HEARTBEAT',
        mavtype: { type: 'MAV_TYPE_QUADROTOR' },
        autopilot: { type: 'MAV_AUTOPILOT_ARDUPILOTMEGA' },
        base_mode: 'MAV_MODE_FLAG_MANUAL_INPUT_ENABLED | MAV_MODE_FLAG_STABILIZE_ENABLED',
        custom_mode: 0,
        system_status: { type: 'MAV_STATE_STANDBY' },
        mavlink_version: 3,
      },
    };
    expect(systemIdOf(frame)).toBe('1');
    expect(airframeFromMavType(frame.message.mavtype)).toEqual({ kind: 'multirotor' });
  });

  it('returns undefined when there is no readable header', () => {
    expect(systemIdOf({ message: { type: 'HEARTBEAT' } })).toBeUndefined();
  });

  // Mirrors the ordinal path's guard. Unreachable against real mavlink2rest,
  // whose system_id is a genuine uint8 — but task 5 turns this value into an
  // asset's localId, and an asset keyed "NaN" would be a quiet, permanent
  // registry entry.
  it('returns undefined for a system_id that is not a whole, non-negative number', () => {
    expect(systemIdOf({ header: { system_id: Number.NaN } })).toBeUndefined();
    expect(systemIdOf({ header: { system_id: 1.5 } })).toBeUndefined();
    expect(systemIdOf({ header: { system_id: -1 } })).toBeUndefined();
    expect(systemIdOf({ header: { system_id: Number.POSITIVE_INFINITY } })).toBeUndefined();
  });

  it('returns undefined for a header without a numeric system_id', () => {
    expect(systemIdOf({ header: {} })).toBeUndefined();
    expect(systemIdOf({ header: { system_id: '1' } })).toBeUndefined();
    expect(systemIdOf({ header: null })).toBeUndefined();
  });

  it('returns undefined for a non-object envelope', () => {
    expect(systemIdOf(undefined)).toBeUndefined();
    expect(systemIdOf(null)).toBeUndefined();
    expect(systemIdOf('HEARTBEAT')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// A contract double for the assets service.
//
// The boundary rule (CLAUDE.md; ADR-0005) permits only `import type` from a
// sibling extension package, so these tests cannot construct the real
// registry — `createAssetRegistry` is runtime code. (The plan's sketch
// imported it from `@gcscode/extension-assets/src/asset-registry.svelte`,
// which is both a runtime sibling import and unresolvable: that package's
// `exports` map has no `./src/*` subpath.)
//
// So this double implements the contract the spec states for the registry:
// per-source `localId` namespacing, replace-in-place under a stable key, a
// fresh `Disposable` per registration with the superseded one inert, inert
// writes through a disposed handle, and an inert source from a torn-down
// registry. Two things cover the risk a double always carries — that it
// drifts from the thing it stands in for: `extension-assets`' own suite
// asserts that contract against the real class (cases 1-14), and task 7 wires
// the real registry to the real adapter inside `packages/shell`, where a
// runtime import of an extension package is allowed.
//
// What the double adds beyond the real registry is the observable case 18
// demands: every `registerAsset` call, in order, with the handle it returned
// and a count of how often the adapter disposed that handle. An unconditional
// re-register leaves `getAssets()` identical, so the asset list cannot see the
// skip. The call log can.
// ---------------------------------------------------------------------------

interface Registration {
  /** A copy, so a later mutation of the adapter's own description object
   *  cannot rewrite what this call is recorded as having passed. */
  description: AssetDescription;
  /** False when the call went through a handle that was already inert — which
   *  is how "the adapter wrote into a dead source" becomes visible. */
  accepted: boolean;
  /** The key the registry minted; undefined for an inert call. */
  key: string | undefined;
  /** The handle handed back, and how often the adapter disposed it. */
  handle: Disposable;
  disposeCount: number;
}

interface FakeAssets extends AssetsApi {
  /** `AssetRegistryHandle`'s lifecycle control, which the real service keeps
   *  off the type consumers write against. */
  teardown(): void;
  /** Every `registerAsset` call in order, inert ones included. */
  readonly registrations: Registration[];
}

function createFakeAssets(): FakeAssets {
  const entries = new Map<string, RegisteredAsset>();
  const liveSourceIds = new Set<string>();
  const disposers = new Set<() => void>();
  const registrations: Registration[] = [];
  let nextKey = 1;
  let tornDown = false;

  function makeSource(sourceId: string, sourceLabel: string): AssetSource {
    const keysByLocalId = new Map<string, string>();
    let disposed = false;

    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      for (const key of keysByLocalId.values()) entries.delete(key);
      keysByLocalId.clear();
      liveSourceIds.delete(sourceId);
      disposers.delete(dispose);
    };

    const registerAsset = (description: AssetDescription): Disposable => {
      const registration: Registration = {
        description: { ...description },
        accepted: !disposed,
        key: undefined,
        handle: { dispose: () => undefined },
        disposeCount: 0,
      };
      registrations.push(registration);
      // An inert handle does nothing and hands back a no-op rather than
      // throwing: the caller is inside a message handler.
      if (disposed) return registration.handle;

      const { localId, airframe } = description;
      const key = keysByLocalId.get(localId) ?? `fake-asset-${nextKey++}`;
      keysByLocalId.set(localId, key);
      const entry: RegisteredAsset = {
        localId,
        // Absent stays absent — an `airframe: undefined` key would make
        // "not asserted" indistinguishable from an asserted value.
        ...(airframe === undefined ? {} : { airframe: { ...airframe } }),
        sourceId,
        sourceLabel,
        key,
      };
      entries.set(key, entry);
      registration.key = key;
      registration.handle = {
        dispose: () => {
          registration.disposeCount++;
          // Entry identity carries both rules: a superseded handle is inert,
          // and disposing twice is a no-op.
          if (entries.get(key) !== entry) return;
          entries.delete(key);
          keysByLocalId.delete(localId);
        },
      };
      return registration.handle;
    };

    const source: AssetSource = {
      sourceId,
      get isLive() {
        return !disposed;
      },
      registerAsset,
      dispose,
    };
    disposers.add(dispose);
    return source;
  }

  return {
    createSource(sourceId, label) {
      if (tornDown) {
        // Built by disposing a real source, exactly as the registry does, so
        // "inert" has one definition rather than two.
        const inert = makeSource(sourceId, label);
        inert.dispose();
        return inert;
      }
      if (liveSourceIds.has(sourceId)) {
        throw new Error(`Asset source id "${sourceId}" is already claimed by a live source.`);
      }
      liveSourceIds.add(sourceId);
      return makeSource(sourceId, label);
    },
    getAssets() {
      return [...entries.values()];
    },
    teardown() {
      tornDown = true;
      for (const dispose of [...disposers]) dispose();
    },
    registrations,
  };
}

/** The measured live frame, trimmed to what the adapter reads plus enough of
 *  the rest to stay recognisable. `mavtype` is the wrapped form mavlink2rest
 *  actually sends. */
const heartbeat = (systemId: number, mavType: string, componentId = 1): unknown => ({
  header: { system_id: systemId, component_id: componentId, sequence: 0 },
  message: {
    type: 'HEARTBEAT',
    mavtype: { type: mavType },
    base_mode: 'MAV_MODE_FLAG_CUSTOM_MODE_ENABLED',
    custom_mode: 0,
  },
});

/** A message the adapter must ignore. The extension's filter admits four of
 *  these alongside HEARTBEAT, every one carrying a `header.system_id` and no
 *  `mavtype` — measured, 2026-10-21. */
const attitude = (systemId: number): unknown => ({
  header: { system_id: systemId, component_id: 1, sequence: 1 },
  message: { type: 'ATTITUDE', roll: 0.01, pitch: -0.02, yaw: 1.5 },
});

describe('createAssetAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Case 15.
  it('registers one asset per system on the first heartbeat, stamped by the registry', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    const registered = assets.getAssets();
    expect(registered).toHaveLength(1);
    expect(registered[0].localId).toBe('1');
    expect(registered[0].airframe).toEqual({ kind: 'multirotor' });
    expect(registered[0].sourceId).toBe('gcscode.sitl');
    // What `assets-demo` renders, per the spec's consumer goal.
    expect(registered[0].sourceLabel).toBe('SITL');
  });

  // Case 25, at the adapter's own seam. The extension-level half — that
  // `activate()` claims nothing either — lives in `index.test.ts`.
  it('claims nothing until the first heartbeat', () => {
    const assets = createFakeAssets();
    const createSource = vi.spyOn(assets, 'createSource');

    const adapter = createAssetAdapter(() => assets);
    expect(createSource).not.toHaveBeenCalled();

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    expect(createSource).toHaveBeenCalledTimes(1);
    expect(createSource).toHaveBeenCalledWith('gcscode.sitl', 'SITL');
  });

  // Case 16.
  it('does not accumulate assets on repeated heartbeats', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    expect(assets.getAssets()).toHaveLength(1);
  });

  // Case 18. The assertion is the call count, not the asset list: an
  // unconditional re-register would leave the list identical and this test
  // would pass against broken code.
  it('skips registration entirely when the description is unchanged', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    expect(assets.registrations).toHaveLength(1);
    // And the adapter still holds the one handle it was given — unchanged,
    // not re-minted and not disposed.
    expect(assets.registrations[0].disposeCount).toBe(0);
    adapter.dispose();
    expect(assets.registrations[0].disposeCount).toBe(1);
  });

  // Case 17.
  it('updates the airframe in place when MAV_TYPE changes, keeping the key', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    const key = assets.getAssets()[0].key;

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_FIXED_WING'));

    expect(assets.getAssets()).toHaveLength(1);
    expect(assets.getAssets()[0].key).toBe(key);
    expect(assets.getAssets()[0].airframe).toEqual({ kind: 'fixed-wing' });
    expect(assets.registrations).toHaveLength(2);
  });

  // Case 19. The adapter must hold the fresh handle and neither keep nor
  // dispose the superseded one, so `dispose()` must reach exactly the second.
  it('holds the fresh Disposable after a change and never the superseded one', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_FIXED_WING'));
    expect(assets.registrations).toHaveLength(2);

    adapter.dispose();

    expect(assets.registrations[0].disposeCount).toBe(0);
    expect(assets.registrations[1].disposeCount).toBe(1);
    expect(assets.getAssets()).toHaveLength(0);
  });

  // Case 19, the other half: the superseded handle is inert, so a consumer
  // holding it cannot remove the replacement. The registry owns that rule
  // (case 6); asserted here because the adapter's swap is only safe if it holds.
  it('leaves the replacement in place when the superseded handle is disposed', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_FIXED_WING'));

    assets.registrations[0].handle.dispose();

    expect(assets.getAssets()).toHaveLength(1);
    expect(assets.getAssets()[0].airframe).toEqual({ kind: 'fixed-wing' });
  });

  // Case 20.
  it('registers two assets for two systems', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(heartbeat(2, 'MAV_TYPE_FIXED_WING'));

    const registered = assets.getAssets();
    expect(registered.map((a) => a.localId)).toEqual(['1', '2']);
    expect(new Set(registered.map((a) => a.key)).size).toBe(2);
  });

  // Case 21, worded as the spec words it: differing *only* in component_id.
  // One asset — and the skip rule means not even a second registration.
  it('registers one asset for two component ids on one system', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR', 1));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR', 154));

    expect(assets.getAssets()).toHaveLength(1);
    expect(assets.registrations).toHaveLength(1);
  });

  // The consequence of "one asset per system, airframe from that heartbeat's
  // MAV_TYPE" when two components of one system announce different types — a
  // companion computer (ONBOARD_CONTROLLER) or gimbal alongside the autopilot.
  // One asset, whose airframe is whichever heartbeat arrived last, re-registered
  // each time the two disagree. v0 accepts it: filtering by component_id would
  // decide the `component_id` question the spec defers. Pinned so the behaviour
  // is a recorded consequence rather than a surprise.
  it('lets the last heartbeat win when two components of one system disagree', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR', 1));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_ONBOARD_CONTROLLER', 191));

    expect(assets.getAssets()).toHaveLength(1);
    expect(assets.getAssets()[0].airframe).toEqual({ kind: 'none' });
    expect(assets.registrations).toHaveLength(2);
  });

  // The extension's filter admits four non-HEARTBEAT types, all carrying a
  // header and no `mavtype`. Acting on them would register an airframe-less
  // asset for an unseen system, and would flap a known system's airframe
  // between asserted and absent at the full message rate — the exact churn the
  // skip rule exists to prevent.
  it('ignores non-HEARTBEAT messages from a system it already knows', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(attitude(1));
    adapter.onMessage(attitude(1));

    expect(assets.registrations).toHaveLength(1);
    expect(assets.getAssets()[0].airframe).toEqual({ kind: 'multirotor' });
  });

  it('claims nothing for a non-HEARTBEAT message from an unknown system', () => {
    const assets = createFakeAssets();
    const createSource = vi.spyOn(assets, 'createSource');
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(attitude(7));

    expect(createSource).not.toHaveBeenCalled();
    expect(assets.getAssets()).toHaveLength(0);
  });

  // Case 24's adapter half: an unreadable MAV_TYPE registers the asset with no
  // `airframe` property at all — the adapter must not pass `airframe: undefined`
  // and make "not asserted" indistinguishable from an asserted value.
  it('registers an asset with no airframe property when MAV_TYPE is unreadable', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage({ header: { system_id: 3 }, message: { type: 'HEARTBEAT' } });

    const registered = assets.getAssets();
    expect(registered).toHaveLength(1);
    expect(registered[0].localId).toBe('3');
    expect(Object.hasOwn(registered[0], 'airframe')).toBe(false);
    expect(Object.hasOwn(assets.registrations[0].description, 'airframe')).toBe(false);
  });

  // `systemIdOf`'s guard reaching the registry: a malformed id must not key an
  // asset, and must not be confused with a valid one.
  it('registers nothing for a heartbeat with no readable system_id', () => {
    const assets = createFakeAssets();
    const createSource = vi.spyOn(assets, 'createSource');
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage({ header: { system_id: Number.NaN }, message: { type: 'HEARTBEAT' } });
    adapter.onMessage({ message: { type: 'HEARTBEAT' } });

    expect(createSource).not.toHaveBeenCalled();
    expect(assets.getAssets()).toHaveLength(0);
  });

  // Case 26, at the adapter's seam. The extension-level half — telemetry
  // keeping working — lives in `index.test.ts`.
  it('warns once and registers nothing while the service is absent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = createAssetAdapter(() => undefined);

    expect(() => {
      adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
      adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
      adapter.onMessage(heartbeat(2, 'MAV_TYPE_FIXED_WING'));
    }).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('claims on the first heartbeat after the service appears', () => {
    const assets = createFakeAssets();
    let resolved: FakeAssets | undefined = undefined;
    const adapter = createAssetAdapter(() => resolved);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    expect(assets.getAssets()).toHaveLength(0);

    resolved = assets;
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    expect(assets.getAssets()).toHaveLength(1);
  });

  // Once per episode, not once per adapter lifetime: a service that is
  // disabled, re-enabled and disabled again is two outages, and with no
  // notification primitive in v0 the console warning is the only signal there
  // is.
  it('warns again when the service goes away a second time', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const assets = createFakeAssets();
    let resolved: FakeAssets | undefined = undefined;
    const adapter = createAssetAdapter(() => resolved);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    expect(warn).toHaveBeenCalledTimes(1);

    // Recovered.
    resolved = assets;
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    expect(assets.getAssets()).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);

    // Gone again — a second episode, a second warning.
    resolved = undefined;
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('warns again when a later claim fails after one succeeded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const assets = createFakeAssets();
    const createSource = vi.spyOn(assets, 'createSource');
    const adapter = createAssetAdapter(() => assets);

    // Episode one: the id is held by someone else.
    const firstSquatter = assets.createSource('gcscode.sitl', 'Someone else');
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    expect(warn).toHaveBeenCalledTimes(1);

    // Recovered: the adapter claims on the next heartbeat.
    firstSquatter.dispose();
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    expect(assets.getAssets()).toHaveLength(1);

    // The adapter's own handle dies, and the id is taken before it can
    // re-claim — a second episode, which must warn again.
    const claimed = createSource.mock.results.at(-1)?.value as AssetSource;
    claimed.dispose();
    const secondSquatter = assets.createSource('gcscode.sitl', 'Someone else again');
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    expect(warn).toHaveBeenCalledTimes(2);
    secondSquatter.dispose();
  });

  // `heartbeatMessageOf`'s rejection path, which is the fix for the severest
  // defect this task found — so it is asserted rather than read.
  it.each([
    ['no message at all', { header: { system_id: 1 } }],
    ['a null message', { header: { system_id: 1 }, message: null }],
    ['a string message', { header: { system_id: 1 }, message: 'HEARTBEAT' }],
    ['a message with no type', { header: { system_id: 1 }, message: { mavtype: 'x' } }],
    ['a numeric type', { header: { system_id: 1 }, message: { type: 42 } }],
    ['a type that is HEARTBEAT-ish', { header: { system_id: 1 }, message: { type: 'HEARTBEAT2' } }],
    ['an undefined envelope', undefined],
    ['a null envelope', null],
    ['a string envelope', 'HEARTBEAT'],
  ])('ignores a frame with %s', (_label, frame) => {
    const assets = createFakeAssets();
    const createSource = vi.spyOn(assets, 'createSource');
    const adapter = createAssetAdapter(() => assets);

    expect(() => adapter.onMessage(frame)).not.toThrow();

    expect(createSource).not.toHaveBeenCalled();
    expect(assets.registrations).toHaveLength(0);
    expect(assets.getAssets()).toHaveLength(0);
  });

  // Case 27. `isLive` is the signal; an identity comparison on what
  // `getExtension()` returns could not see this, since the host builds a fresh
  // record per call and only `.exports` is stable.
  it('re-claims after the registry is torn down and replaced', () => {
    let assets = createFakeAssets();
    const first = assets;
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    expect(first.getAssets()).toHaveLength(1);

    first.teardown();
    expect(first.getAssets()).toHaveLength(0);
    assets = createFakeAssets();

    expect(() => adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'))).not.toThrow();

    expect(assets.getAssets()).toHaveLength(1);
    expect(assets.getAssets()[0].airframe).toEqual({ kind: 'multirotor' });
    // Nothing was written through the dead handle.
    expect(first.registrations.every((r) => r.accepted)).toBe(true);
  });

  // The degenerate half of case 27: torn down and *not* replaced. The claim
  // returns an inert source, so the write is a no-op and nothing throws.
  it('degrades when the registry is torn down and never replaced', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    assets.teardown();

    expect(() => adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'))).not.toThrow();
    expect(assets.getAssets()).toHaveLength(0);
  });

  // A disposed adapter stays disposed. Its own `dispose()` and containment's
  // `disposeAll(context.subscriptions)` are the same call, and the extension's
  // WebSocket is not a subscription — so after a failed activation the socket
  // keeps delivering heartbeats. Re-claiming there would re-register the assets
  // containment had just removed, one second later, defeating case 32.
  it('stays disposed: a heartbeat after dispose claims nothing', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.dispose();
    const createSource = vi.spyOn(assets, 'createSource');

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    expect(createSource).not.toHaveBeenCalled();
    expect(assets.getAssets()).toHaveLength(0);
  });

  it('disposes idempotently', () => {
    const assets = createFakeAssets();
    const adapter = createAssetAdapter(() => assets);

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.dispose();
    adapter.dispose();

    expect(assets.registrations[0].disposeCount).toBe(1);
  });

  // `createSource` throws on a duplicate live id, and the adapter runs inside a
  // WebSocket message handler that does not catch what a handler throws. So the
  // claim degrades, warns once, and retries — the next heartbeat after the
  // stale source goes away succeeds.
  it('degrades and recovers when the claim throws', () => {
    const assets = createFakeAssets();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const squatter = assets.createSource('gcscode.sitl', 'Someone else');
    const adapter = createAssetAdapter(() => assets);

    expect(() => {
      adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
      adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    }).not.toThrow();
    expect(assets.getAssets()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);

    squatter.dispose();
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    expect(assets.getAssets()).toHaveLength(1);
  });
});
