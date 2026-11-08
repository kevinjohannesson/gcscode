# SITL listener — additional telemetry fields

**Status:** Approved (2026-04-28)

## Context

Purely additive extension of the SITL listener iteration. The previous iteration shipped HEARTBEAT + GLOBAL_POSITION_INT consumption — six visible telemetry rows (mode, armed, lat, lng, alt, heading). This iteration adds the rest of the "Full" telemetry set the listener spec deferred: attitude (roll/pitch/yaw), groundspeed, and battery (voltage + remaining %). Three more MAVLink message types (ATTITUDE, VFR_HUD, SYS_STATUS) join the WebSocket filter; the reducer gains three cases; the view gains six rows; tests gain four new reducer cases plus updates to the "all-null initial state" and "reset clears everything" assertions.

No structural changes. No new modules. No API surface changes. Same `$state` singleton, same `applyMessage` shape, same null-fallback view formatters, same `vi.stubGlobal('WebSocket', MockWebSocket)` test pattern. The iteration is "do exactly what we did before, three more times."

The cross-repo bridge (`Drone SITL/run_sitl.sh`) does not change — `mavlink2rest` sends whatever the WebSocket subscriber asks for via the regex filter, so extending the filter is a one-string edit on our side.

## Decisions deliberately out of this iteration

- **Throttle / status / RC channels.** MAVLink has many more message types (`RC_CHANNELS_RAW`, `SERVO_OUTPUT_RAW`, etc.). Adding any of them is the same shape as the three this iteration ships; defer until a real consumer pulls.

- **GPS health / fix type.** `GPS_RAW_INT` carries fix type, satellites visible, HDOP. Useful for "is my position any good" but not in the immediate visual story. Same trigger as above.

- **Attitude rates.** ATTITUDE also carries `rollspeed`, `pitchspeed`, `yawspeed`. The static angles are more useful at the human-glance level; rates can come later when there's a real consumer (a roll/pitch indicator, a glide-path widget).

- **Charge / current.** `SYS_STATUS.current_battery` (cA) is available alongside voltage. Defer; the current-draw isn't valuable without a "remaining flight time" calculation, which is its own iteration.

- **Per-row visual treatment.** No styling, no color thresholds (e.g. low-battery red). `<dt>/<dd>` rows with `'—'` fallback mirror the existing pattern. Trigger to revisit: a real consumer wants a status-at-a-glance dashboard.

## Goals

- Extend the WebSocket filter regex in `packages/extension-sitl/src/index.ts` from `^(HEARTBEAT|GLOBAL_POSITION_INT)$` to `^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS)$`. One-string edit.

- Extend `TelemetryState` in `packages/extension-sitl/src/telemetry-store.svelte.ts` with six new optional fields: `roll`, `pitch`, `yaw` (radians, `number | null`), `groundspeed` (m/s, `number | null`), `voltageBattery` (V, `number | null`), `batteryRemaining` (%, `number | null`).

- Extend `applyMessage` in the same file with three new cases: ATTITUDE (sets roll/pitch/yaw); VFR_HUD (sets groundspeed); SYS_STATUS (sets voltageBattery from `voltage_battery / 1000`, sets batteryRemaining from `battery_remaining` with a special case: a value of `-1` means "unknown" per MAVLink convention and stores as `null`).

- Extend the initial state literal AND the `reset()` body to include all six new fields at `null`.

- Extend `sitl-view.svelte` with six new `<dt>/<dd>` rows: Roll, Pitch, Yaw, Groundspeed, Battery (V), Battery %. Three new formatters: `fmtAttitude(rad)` (radians → degrees with one decimal + `°`), `fmtSpeed(mps)` (one decimal + ` m/s`), `fmtVoltage(v)` (two decimals + ` V`), `fmtPercent(n)` (`${n}%`).

- Extend `telemetry-store.svelte.test.ts` with: new ATTITUDE case test, new VFR_HUD case test, new SYS_STATUS case test (with mV-to-V scaling), new SYS_STATUS case test where `battery_remaining` is `-1` and the field becomes null, updates to the existing "initial state" and "reset" tests to assert on all six new fields too.

- All existing tests pass without modification (apart from the two assertion updates above). Workspace test count grows by 4 (new tests). Total expected: 139.

## Non-goals

- **No new modules, no new files.** Two existing files are modified (`telemetry-store.svelte.ts`, `sitl-view.svelte`). Three more (`index.ts`, `telemetry-store.svelte.test.ts`) get tiny edits. Nothing else moves.
- **No reducer-level type schema for MAVLink messages.** Each case reads from `unknown` and narrows defensively, same shape as the existing HEARTBEAT and GLOBAL_POSITION_INT cases.
- **No tests for the view component itself.** Same posture as the listener iteration — the view is presentational; reactive consumption is exercised by the dev-server smoke test.
- **No changes to `mavlink-client.ts` or its tests.** The client is message-agnostic; only the URL filter changes.
- **No changes to `index.test.ts`.** Existing 6 tests stay valid — they don't exercise the new fields.
- **No changes to `@gcscode/extension-api`, registry, manager, persistence, manifest, app.svelte, main.ts, dispatcher, or any ADR.**
- **No changes to `Drone SITL/run_sitl.sh`.** mavlink2rest's filter is set by the WebSocket URL query param; the bridge sends whatever we ask for.
- **No `docs/out-of-scope.md` propagation.** None of its bullets are touched.
- **No `docs/roadmap.md` propagation.** The "SITL listener" line already shipped (checked) — this iteration extends it without warranting a new entry. The spec deferred these fields explicitly with "Trigger: real consumer wants them — likely the next iteration after this lands."

## Public API surface

The `Extension` exported from `@gcscode/extension-sitl` does not change. Same id, same displayName, same view id, same command id, same keybinding, same `deactivate?()` signature. The `getLocation` command continues to return `{ lat, lng, alt } | null`; the new fields are NOT in its return shape (this command is location-specific, not a general telemetry getter).

## Implementation sketches

### `packages/extension-sitl/src/telemetry-store.svelte.ts`

Extend the `TelemetryState` interface and the initial-state literal:

```ts
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
```

Initial state literal (the existing `$state({...})` declaration) gains `roll: null, pitch: null, yaw: null, groundspeed: null, voltageBattery: null, batteryRemaining: null,`.

Three new cases in `applyMessage`'s `switch (type)` (or `if/else` chain) — same defensive shape as the existing HEARTBEAT / GLOBAL_POSITION_INT cases:

```ts
} else if (type === 'ATTITUDE') {
  if (typeof msg.roll === 'number') telemetryState.roll = msg.roll;
  if (typeof msg.pitch === 'number') telemetryState.pitch = msg.pitch;
  if (typeof msg.yaw === 'number') telemetryState.yaw = msg.yaw;
} else if (type === 'VFR_HUD') {
  if (typeof msg.groundspeed === 'number') telemetryState.groundspeed = msg.groundspeed;
} else if (type === 'SYS_STATUS') {
  if (typeof msg.voltage_battery === 'number') {
    telemetryState.voltageBattery = msg.voltage_battery / 1000;
  }
  if (typeof msg.battery_remaining === 'number') {
    telemetryState.batteryRemaining = msg.battery_remaining === -1 ? null : msg.battery_remaining;
  }
}
```

The `typeof === 'number'` guards mirror the existing per-field guards in GLOBAL_POSITION_INT — sparse messages don't blank out fields they don't carry. The `-1 → null` special case for `battery_remaining` follows MAVLink convention (the field uses `-1` as "unknown" sentinel because the type is signed int8).

`reset()` body gains assignments for the six new fields:

```ts
telemetryState.roll = null;
telemetryState.pitch = null;
telemetryState.yaw = null;
telemetryState.groundspeed = null;
telemetryState.voltageBattery = null;
telemetryState.batteryRemaining = null;
```

### `packages/extension-sitl/src/index.ts`

One string changes — the `FILTER` constant:

```ts
const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS)$';
```

That's the entire file delta.

### `packages/extension-sitl/src/sitl-view.svelte`

Three new formatters in the `<script>` block:

```ts
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
```

Six new `<dt>/<dd>` pairs appended to the existing `<dl>`, after the Heading row:

```svelte
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
```

### `packages/extension-sitl/src/telemetry-store.svelte.test.ts`

**Modify two existing tests:**

- "initial state — all telemetry fields null": extend the assertion to include `roll: null, pitch: null, yaw: null, groundspeed: null, voltageBattery: null, batteryRemaining: null`.
- "reset() returns to initial": same extension.

**Add four new tests:**

1. `applyMessage with ATTITUDE updates roll/pitch/yaw` — synthetic JSON `{ message: { type: 'ATTITUDE', roll: 0.1, pitch: -0.2, yaw: 1.5 } }`; assert all three set.
2. `applyMessage with VFR_HUD updates groundspeed` — synthetic JSON `{ message: { type: 'VFR_HUD', groundspeed: 4.5 } }`; assert.
3. `applyMessage with SYS_STATUS scales mV to V and stores remaining` — synthetic JSON `{ message: { type: 'SYS_STATUS', voltage_battery: 12450, battery_remaining: 87 } }`; assert `voltageBattery === 12.45` and `batteryRemaining === 87`.
4. `applyMessage with SYS_STATUS battery_remaining=-1 stores null` — synthetic JSON `{ message: { type: 'SYS_STATUS', voltage_battery: 12450, battery_remaining: -1 } }`; assert `voltageBattery === 12.45` and `batteryRemaining === null`.

Total telemetry-store test count grows from 9 to 13.

## Files modified / added

| Path                                                         | Change                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `packages/extension-sitl/src/telemetry-store.svelte.ts`      | Extend `TelemetryState` with 6 new fields; extend initial state literal; add 3 reducer cases; extend `reset()`. |
| `packages/extension-sitl/src/telemetry-store.svelte.test.ts` | Update 2 existing tests' assertions; add 4 new reducer tests.                                                   |
| `packages/extension-sitl/src/index.ts`                       | Extend `FILTER` regex string.                                                                                   |
| `packages/extension-sitl/src/sitl-view.svelte`               | Add 4 formatters; add 6 `<dt>/<dd>` rows.                                                                       |

No other files modified. No files created. No files deleted.

No changes to `index.test.ts`, `mavlink-client.ts` or its test, `eslint.config.ts`, `Drone SITL/run_sitl.sh`, registry, manager, persistence, manifest, app.svelte, main.ts, dispatcher, `docs/out-of-scope.md`, `docs/roadmap.md`, or any ADR.

## Verification

- `pnpm check` clean across all 4 packages.
- `pnpm test` — workspace count grows from 135 to 139 (4 new reducer tests; the two existing tests being modified still count as 1 each).
  - SITL package breakdown: 13 telemetry-store + 8 mavlink-client + 6 index = 27 (was 23).
- `pnpm lint` clean.
- `pnpm --filter @gcscode/shell build` succeeds. Bundle delta: small — a few hundred bytes for the new view rows + formatters + reducer cases.
- `pnpm dev` smoke test: with `mavlink2rest` running, the SITL Telemetry view shows all 12 telemetry rows populating live. Roll/Pitch/Yaw flicker as ArduCopter's attitude estimator runs. Groundspeed reads `0.0 m/s` on the ground. Battery shows ArduCopter SITL's default value (typically `12.59 V` / `100%`).

If `mavlink2rest` is not running: same fallback as the listener iteration — view shows all rows as `'—'` with `Disconnected` badge. No crash.

## Follow-ups (out of scope for this iteration)

- **Attitude rates** (rollspeed/pitchspeed/yawspeed) — same shape, additive. Trigger: a consumer that needs angular rates.
- **GPS health** (GPS_RAW_INT fix type, satellites visible, HDOP). Same shape. Trigger: a "GPS quality" indicator.
- **Battery current draw + flight-time estimation.** Bigger; needs derived state.
- **Per-row visual treatment** — color thresholds for low battery, attitude warning, etc. UI design iteration when there's enough data to design around.
- **`getLocation` command extension to a `getTelemetry` command** that returns the full state. Trigger: a consumer that wants more than lat/lng/alt.

## Cross-cutting notes

**The reducer's per-field guards keep growing.** Each new case follows the same defensive pattern: `if (typeof msg.field === 'number') ...`. With seven message types and ~20 fields total, the file is still small (~120 lines post-iteration), but if it triples again, a small lookup-table refactor (`{ HEARTBEAT: parseHeartbeat, ... }`) would be more idiomatic. Not worth doing yet.

**MAVLink unit conventions are MAVLink's, not ours.** The reducer faithfully scales `voltage_battery` mV → V, but stores `roll/pitch/yaw` in radians (the source unit). The view does the radian → degree conversion at display time. The choice avoids a "should I scale it now or later" coin flip per field — the rule is "scale to a unit a person would write on a whiteboard at display time, store source units in the state" (V is what people say; radians is what MAVLink says; the asymmetry is on purpose).

**`battery_remaining: -1` → null is a MAVLink convention, not ours.** The field is `int8_t` with `-1` reserved for "battery monitoring not active." We translate to `null` so the view can show `'—'` instead of `-1%`. The test pins this behavior so a future change doesn't accidentally surface `-1` to users.

**Filter regex stays in `index.ts`, not in the store.** The store doesn't know which messages it's filtering; mavlink2rest does. If a future consumer wants the store to become subscription-aware (e.g. "only update when the connected pilot is in GUIDED mode"), that's a different layer. For now: `index.ts` constructs the URL with the filter, the store handles whatever arrives.
