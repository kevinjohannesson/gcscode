/**
 * The MAVLink asset adapter. Two halves:
 *
 * - the pure one — `MAV_TYPE` -> gcscode's airframe vocabulary, and the sender
 *   id out of an envelope header — which unit-tests with no registry and no
 *   client;
 * - the stateful one, `createAssetAdapter`, which resolves the assets service
 *   per inbound message, claims a source lazily on the first heartbeat, and
 *   registers one asset per MAVLink system.
 *
 * Both import only types across the package boundary (ADR-0005): the live API
 * arrives through the resolver `createAssetAdapter` is handed, which the
 * extension builds from `host.extensions.getExtension(...)`.
 */

import type { Disposable } from '@gcscode/extension-api';
import type { Airframe, AssetDescription, AssetSource, AssetsApi } from '@gcscode/extension-assets';

/** Every rotor count the dialect spells, plus the generic. Closed sets of
 *  whole tokens rather than regexes: there is no pattern to match, membership
 *  is what is meant, and a member added later cannot bring a metacharacter
 *  with it. (`VTOL_` stays a prefix test — that one genuinely needs pattern
 *  behaviour, and it is why an upstream rename does not break the rule.) */
const MULTIROTOR: ReadonlySet<string> = new Set([
  'MAV_TYPE_TRICOPTER',
  'MAV_TYPE_QUADROTOR',
  'MAV_TYPE_HEXAROTOR',
  'MAV_TYPE_OCTOROTOR',
  'MAV_TYPE_DECAROTOR',
  'MAV_TYPE_DODECAROTOR',
  'MAV_TYPE_GENERIC_MULTIROTOR',
]);

/** Anything the vocabulary can assert does not fly, in the spec's three
 *  sub-families. A family rule, not an enumeration — `none` is a claim about
 *  flight, not about importance. */
const NON_FLYING: ReadonlySet<string> = new Set([
  // ground and surface craft
  'MAV_TYPE_GROUND_ROVER',
  'MAV_TYPE_GROUND_QUADRUPED',
  'MAV_TYPE_SURFACE_BOAT',
  'MAV_TYPE_SUBMARINE',
  // ground stations and trackers
  'MAV_TYPE_GCS',
  'MAV_TYPE_ANTENNA_TRACKER',
  // peripherals and payloads, carried by something else
  'MAV_TYPE_GIMBAL',
  'MAV_TYPE_CAMERA',
  'MAV_TYPE_SERVO',
  'MAV_TYPE_WINCH',
  'MAV_TYPE_ONBOARD_CONTROLLER',
  'MAV_TYPE_ADSB',
  'MAV_TYPE_ODID',
  'MAV_TYPE_BATTERY',
  'MAV_TYPE_ILLUMINATOR',
  'MAV_TYPE_GRIPPER',
  'MAV_TYPE_FLARM',
  'MAV_TYPE_LOG',
  'MAV_TYPE_OSD',
  'MAV_TYPE_IMU',
  'MAV_TYPE_GPS',
  'MAV_TYPE_CHARGING_STATION',
]);

/**
 * Every `MAV_TYPE` ordinal whose name the rules below give a word to — so that
 * the numeric form and the enum-name form always agree, which the spec asserts
 * as a flat claim. Ordinal 4 is carried even though the fallback already
 * answers `unknown` for it: if `rotary-wing` ever joins the vocabulary, a
 * HELICOPTER rule would otherwise be picked up by the enum-name form and
 * silently missed by the numeric one.
 *
 * Read out of MAVLink's `minimal.xml` — where `MAV_TYPE` is defined, not
 * `common.xml` — in a separate ArduPilot checkout driving the SITL this module
 * was measured against. That dialect is **not** vendored in gcscode: there is
 * no submodule and no copy of the definitions, so neither CI nor a fresh clone
 * can re-derive this table. The tests are the durable guard. Any ordinal
 * absent here is reported `unknown` rather than named incorrectly.
 */
const NAME_BY_ORDINAL: Record<number, string> = {
  1: 'MAV_TYPE_FIXED_WING',
  2: 'MAV_TYPE_QUADROTOR',
  4: 'MAV_TYPE_HELICOPTER',
  5: 'MAV_TYPE_ANTENNA_TRACKER',
  6: 'MAV_TYPE_GCS',
  10: 'MAV_TYPE_GROUND_ROVER',
  11: 'MAV_TYPE_SURFACE_BOAT',
  12: 'MAV_TYPE_SUBMARINE',
  13: 'MAV_TYPE_HEXAROTOR',
  14: 'MAV_TYPE_OCTOROTOR',
  15: 'MAV_TYPE_TRICOPTER',
  18: 'MAV_TYPE_ONBOARD_CONTROLLER',
  19: 'MAV_TYPE_VTOL_DUOROTOR',
  20: 'MAV_TYPE_VTOL_QUADROTOR',
  21: 'MAV_TYPE_VTOL_TILTROTOR',
  22: 'MAV_TYPE_VTOL_RESERVED2',
  23: 'MAV_TYPE_VTOL_RESERVED3',
  24: 'MAV_TYPE_VTOL_RESERVED4',
  25: 'MAV_TYPE_VTOL_RESERVED5',
  26: 'MAV_TYPE_GIMBAL',
  27: 'MAV_TYPE_ADSB',
  29: 'MAV_TYPE_DODECAROTOR',
  30: 'MAV_TYPE_CAMERA',
  31: 'MAV_TYPE_CHARGING_STATION',
  32: 'MAV_TYPE_FLARM',
  33: 'MAV_TYPE_SERVO',
  34: 'MAV_TYPE_ODID',
  35: 'MAV_TYPE_DECAROTOR',
  36: 'MAV_TYPE_BATTERY',
  38: 'MAV_TYPE_LOG',
  39: 'MAV_TYPE_OSD',
  40: 'MAV_TYPE_IMU',
  41: 'MAV_TYPE_GPS',
  42: 'MAV_TYPE_WINCH',
  43: 'MAV_TYPE_GENERIC_MULTIROTOR',
  44: 'MAV_TYPE_ILLUMINATOR',
  46: 'MAV_TYPE_GROUND_QUADRUPED',
  47: 'MAV_TYPE_VTOL_GYRODYNE',
  48: 'MAV_TYPE_GRIPPER',
};

/** The mapping table itself. Every branch is an assertion about the asset, so
 *  the fallback is `unknown` — "gcscode has no word for this" — never a guess. */
function airframeFromName(name: string): Airframe | undefined {
  // A string is only an assertion if it is shaped like a `MAV_TYPE` name.
  // Anything else is an unreadable value, not an unnameable one.
  if (!name.startsWith('MAV_TYPE_')) return undefined;
  // A family rule, not an enumeration: every rotor count and the generic. Where
  // the vocabulary can name something it must, so a ten-rotor aircraft is named
  // rather than sent to `unknown`. COAXIAL and HELICOPTER stay out — rotary-wing
  // but not multirotor, which is the genuine gap.
  if (MULTIROTOR.has(name)) return { kind: 'multirotor' };
  if (name === 'MAV_TYPE_FIXED_WING') return { kind: 'fixed-wing' };
  // Prefix rather than enumeration: the VTOL family has been renamed upstream
  // (the dialect behind this SITL still spells 23 `VTOL_RESERVED3`, where
  // newer MAVLink spells it `VTOL_TAILSITTER`) and a prefix survives that.
  if (name.startsWith('MAV_TYPE_VTOL_')) return { kind: 'vtol' };
  if (NON_FLYING.has(name)) return { kind: 'none' };
  // Includes MAV_TYPE_HELICOPTER: rotary-wing but not multirotor, and gcscode
  // has no word for it. Calling it `multirotor` would be a lie a consumer
  // cannot detect. See the spec's Known unknowns.
  return { kind: 'unknown' };
}

/**
 * An absent return means **not asserted** — no readable `MAV_TYPE` was
 * present. That is deliberately distinct from `{ kind: 'unknown' }`, which
 * asserts the adapter saw a type gcscode has no word for. Collapsing the two
 * loses the distinction the vocabulary is built on: a registry of assets with
 * no airframe is indistinguishable from a fleet whose airframes nobody
 * asserted.
 *
 * Three input forms are accepted. mavlink2rest wraps plain enums as
 * `{ type: 'MAV_TYPE_*' }` — measured against a live stream, and the only form
 * that occurs in practice. The bare string is accepted because the repo's
 * existing parser tolerates it for the `base_mode` bitfield, and the number
 * because that parser tolerates numbers too.
 */
export function airframeFromMavType(value: unknown): Airframe | undefined {
  if (typeof value === 'object' && value !== null) {
    const inner = (value as { type?: unknown }).type;
    return typeof inner === 'string' ? airframeFromName(inner) : undefined;
  }
  if (typeof value === 'string') return airframeFromName(value);
  if (typeof value === 'number') {
    // An ordinal is a non-negative integer. Anything else — fractional, signed,
    // NaN, Infinity — is malformed rather than an assertion gcscode cannot name.
    if (!Number.isInteger(value) || value < 0) return undefined;
    const name: string | undefined = NAME_BY_ORDINAL[value];
    // A number the vehicle sent IS an assertion even when this module has no
    // name for the ordinal, so the honest answer is `unknown`, not absent.
    return name === undefined ? { kind: 'unknown' } : airframeFromName(name);
  }
  return undefined;
}

/** The asset's `localId`, read from the envelope header the rest of this
 *  package has never needed. `applyMessage` reads `message` and nothing else. */
export function systemIdOf(json: unknown): string | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const header = (json as { header?: unknown }).header;
  if (typeof header !== 'object' || header === null) return undefined;
  const id = (header as { system_id?: unknown }).system_id;
  // Same readability guard as the ordinal path: a whole, non-negative number
  // or nothing. `system_id` is a uint8 on the wire, so this is unreachable
  // against real mavlink2rest — but this value becomes an asset's `localId`,
  // and `{ system_id: NaN }` would otherwise key a permanent `"NaN"` entry.
  // Deliberately no upper bound: an out-of-range but whole id still yields a
  // stable, opaque `localId`, and rejecting it would drop a real asset from a
  // nonstandard source rather than merely mis-name it.
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) return undefined;
  return String(id);
}

// ---------------------------------------------------------------------------
// The stateful half: claim, re-claim, and the skip rule.
// ---------------------------------------------------------------------------

/** The id this adapter claims, and the label a consumer renders. `sourceId` is
 *  a comparison token and never displayed; `sourceLabel` is the operator-facing
 *  name, which is why they are not the same string (ADR-0011). */
const SOURCE_ID = 'gcscode.sitl';
const SOURCE_LABEL = 'SITL';

/** What the adapter remembers per MAVLink system. */
interface TrackedAsset {
  /** The handle the latest registration returned. Swapped on every real
   *  change: replacing a registration leaves the superseded handle inert, so
   *  keeping it would leave the adapter holding something that can no longer
   *  remove its asset. */
  disposable: Disposable;
  /** The description that handle was registered with — the skip rule's
   *  comparison basis. */
  description: AssetDescription;
}

export interface MavlinkAssetAdapter extends Disposable {
  /** Called for every frame the client delivers, heartbeat or not. */
  onMessage(json: unknown): void;
}

/**
 * The adapter's write path.
 *
 * Resolution is **per message**, and the handle is re-claimed whenever it
 * reports `isLive === false` — the signal the spec chose over comparing what
 * `host.extensions.getExtension()` returns, which is a freshly built record on
 * every call (only `.exports` is stable) and which could not see a handle
 * disposed by the host either way.
 *
 * Recovery latency therefore equals the message period: nothing re-claims
 * until the next heartbeat the adapter acts on. Fine at SITL's 1 Hz; an
 * adapter whose source is event-driven rather than periodic inherits "my
 * assets reappear whenever something next happens", which can be never.
 *
 * Nothing here throws. It runs inside a WebSocket message handler that
 * deliberately does not catch what a handler throws (see `mavlink-client`), so
 * an absent service — or a claim the registry refuses — degrades to one
 * warning and keeps the extension's telemetry duties intact.
 */
export function createAssetAdapter(resolve: () => AssetsApi | undefined): MavlinkAssetAdapter {
  let source: AssetSource | undefined;
  const tracked = new Map<string, TrackedAsset>();
  let disposed = false;
  let warnedAboutAbsence = false;
  let warnedAboutClaim = false;

  const claim = (api: AssetsApi): AssetSource | undefined => {
    // Every handle in `tracked` belonged to the source being replaced, and a
    // superseded source's handles are inert. Dropping them here is what keeps
    // the skip rule honest across a re-claim: a kept description would skip
    // the registration the new source still needs.
    tracked.clear();
    try {
      return api.createSource(SOURCE_ID, SOURCE_LABEL);
    } catch (error) {
      // `createSource` throws on a duplicate live id — the one throwing path
      // in the service's contract. Unreachable while this extension is the
      // only claimant of its own id, and caught anyway: the alternative is an
      // exception escaping a WebSocket handler once per second. The next
      // heartbeat retries, so the adapter recovers on its own once whatever
      // held the id lets go.
      if (!warnedAboutClaim) {
        warnedAboutClaim = true;
        console.warn(
          'gcscode.sitl: could not claim an asset source; not registering assets.',
          error,
        );
      }
      return undefined;
    }
  };

  return {
    onMessage(json: unknown): void {
      // A disposed adapter stays disposed. Its own `dispose()` and
      // containment's `disposeAll(context.subscriptions)` are the same call,
      // and this extension's WebSocket is not a subscription — so after a
      // failed activation the socket keeps delivering. Re-claiming there would
      // re-register the assets containment had just removed.
      if (disposed) return;

      // Only HEARTBEAT carries a vehicle type. The extension's filter also
      // admits ATTITUDE, GLOBAL_POSITION_INT, VFR_HUD and SYS_STATUS, each
      // with a `header.system_id` and no `mavtype`: acting on those would
      // register airframe-less assets and flap a known system's airframe
      // between asserted and absent at the full message rate — the churn the
      // skip rule exists to prevent.
      const heartbeat = heartbeatMessageOf(json);
      if (heartbeat === undefined) return;

      const localId = systemIdOf(json);
      // No readable sender id: nothing identifies the asset, so there is
      // nothing to register. Deliberately before the claim, so a malformed
      // frame neither claims a source nor reports the service absent.
      if (localId === undefined) return;

      const api = resolve();
      if (api === undefined) {
        // Degrade, do not throw: the absence is observable (ADR-0012), and the
        // containment iteration left no throwing dependency resolution in the
        // tree. Once per adapter, not once per heartbeat.
        if (!warnedAboutAbsence) {
          warnedAboutAbsence = true;
          console.warn('gcscode.sitl: the assets service is not active; not registering assets.');
        }
        return;
      }

      if (source === undefined || !source.isLive) {
        source = claim(api);
        if (source === undefined) return;
      }

      const description: AssetDescription = { localId };
      const airframe = airframeFromMavType(heartbeat['mavtype']);
      // Assigned only when asserted: an `airframe: undefined` key would make
      // "not asserted" indistinguishable from an asserted value.
      if (airframe !== undefined) description.airframe = airframe;

      const existing = tracked.get(localId);
      // The skip. Re-registering at heartbeat rate would mint a fresh handle
      // and inert the prior one every second, churning every consumer's
      // derived state — and falsifying the premise ADR-0011's
      // filtering-replaces-querying decision rests on.
      if (existing !== undefined && sameDescription(existing.description, description)) return;

      // Replacing supersedes the prior handle, which goes inert — so the
      // stored one is swapped, never kept alongside and never disposed later.
      tracked.set(localId, { disposable: source.registerAsset(description), description });
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      // Disposing the source already removes every asset it registered, so
      // this loop is redundant today. It is here because the adapter *owns*
      // these handles: disposing what it owns before dropping the reference is
      // what makes "it holds the fresh handle, never the superseded one"
      // (case 19) an observable claim rather than an aspiration, and it is the
      // path a later iteration needs when a single asset goes away on its own.
      for (const { disposable } of tracked.values()) disposable.dispose();
      tracked.clear();
      source?.dispose();
      source = undefined;
    },
  };
}

/** The HEARTBEAT body, or undefined for anything else. `message.type` is
 *  mavlink2rest's message-name discriminator — the same field
 *  `telemetry-store`'s reducer switches on. */
function heartbeatMessageOf(json: unknown): Record<string, unknown> | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const message = (json as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return undefined;
  const msg = message as Record<string, unknown>;
  return msg['type'] === 'HEARTBEAT' ? msg : undefined;
}

/** `kind` is the whole of `Airframe` today, so comparing it compares the whole
 *  description. A variant that grows a field of its own must extend this —
 *  otherwise the skip would swallow a real change. */
function sameDescription(a: AssetDescription, b: AssetDescription): boolean {
  return a.localId === b.localId && a.airframe?.kind === b.airframe?.kind;
}
