# SITL listener — additional telemetry fields implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the SITL listener with three more MAVLink message types (ATTITUDE, VFR_HUD, SYS_STATUS), six new reactive fields (roll/pitch/yaw/groundspeed/voltageBattery/batteryRemaining), six new view rows with three new formatters, and four new reducer tests. Purely additive.

**Architecture:** No structural change. Same `$state` singleton, same `applyMessage` shape, same null-fallback view formatters, same `vi.stubGlobal('WebSocket', MockWebSocket)` test pattern. Four file edits in `packages/extension-sitl/src/`. No new modules. No cross-repo work. The mavlink2rest bridge sends what the WebSocket subscriber asks for via the regex filter; extending the filter is a one-string edit on our side.

**Tech Stack:** TypeScript, Svelte 5 (`$state` rune in `.svelte.ts`), Vitest. No new dependencies.

**Spec:** `docs/specs/2026-04-28-extension-sitl-listener-fields.md` (commit `1811baa`). The spec is the canonical reference for field names, MAVLink units, scaling factors, and the four new test cases. This plan sequences the work, gives exact commands, and references spec sections rather than re-pasting them.

**Reference modules in their current state:**

- `packages/extension-sitl/src/telemetry-store.svelte.ts` — current TelemetryState has 7 fields (mode, armed, lat, lng, alt, heading, connection). Three reducer cases (HEARTBEAT, GLOBAL_POSITION_INT, ignore-anything-else).
- `packages/extension-sitl/src/sitl-view.svelte` — current view has 6 telemetry rows + connection badge, with four formatters (`fmtCoord`, `fmtAlt`, `fmtHeading`, `fmtArmed`).
- `packages/extension-sitl/src/index.ts` — current `FILTER` is `'^(HEARTBEAT|GLOBAL_POSITION_INT)$'`.
- `packages/extension-sitl/src/telemetry-store.svelte.test.ts` — 9 tests, 2 of which assert on the full state shape (initial state, reset).

**ADRs to be aware of:** None modified. ADR-0003's Phase B retrospective is not touched (this iteration is feature-extension polish, not architecture).

---

## File structure

| Path                                                         | Responsibility                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `packages/extension-sitl/src/telemetry-store.svelte.ts`      | Modify. Six new fields on `TelemetryState`; three new reducer cases; extend initial-state literal and `reset()`. |
| `packages/extension-sitl/src/telemetry-store.svelte.test.ts` | Modify. Update 2 existing tests' assertions; add 4 new reducer tests.                                            |
| `packages/extension-sitl/src/index.ts`                       | Modify. One-string change: extend the `FILTER` regex.                                                            |
| `packages/extension-sitl/src/sitl-view.svelte`               | Modify. Three new formatters; six new `<dt>/<dd>` rows.                                                          |

No files created. No files deleted. No changes to `mavlink-client.ts`, `index.test.ts`, or anywhere outside `packages/extension-sitl/`.

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree on the feature branch**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `feat/extension-sitl-listener-fields`. If `master`, STOP — report BLOCKED.

(Per CLAUDE.md "Subagent worktree discipline" — every bash call begins with `cd <worktree>/shell &&`. Repeated in every step.)

- [ ] **Step 2: Verify all tests pass before changes**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && pnpm test`
Expected: 135 tests pass — 109 in `@gcscode/shell` (50 registry, 8 app, 27 keybinding, 14 manager, 8 persistence, 2 manifest), 3 in `@gcscode/extension-example`, 23 in `@gcscode/extension-sitl` (9 store + 8 client + 6 index).

- [ ] **Step 3: Verify check + lint clean**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

---

### Task 2: Extend telemetry store + reducer + view + filter (TDD, single commit)

**Files:**

- Modify: `packages/extension-sitl/src/telemetry-store.svelte.ts`
- Modify: `packages/extension-sitl/src/telemetry-store.svelte.test.ts`
- Modify: `packages/extension-sitl/src/index.ts`
- Modify: `packages/extension-sitl/src/sitl-view.svelte`

This task ships everything in one commit. The four changes are tightly coupled — partial commits would leave the codebase in inconsistent states (e.g. store has new fields, view doesn't render them; or filter asks for messages the reducer ignores). TDD-style: write the tests first, watch them fail, apply the four edits, watch them pass.

- [ ] **Step 1: Write the 4 new failing reducer tests + update the 2 existing assertions**

In `packages/extension-sitl/src/telemetry-store.svelte.test.ts`:

**Modify** the existing `initial state — all telemetry fields are null` test's assertion (currently asserts on 7 fields) to also assert that `roll`, `pitch`, `yaw`, `groundspeed`, `voltageBattery`, `batteryRemaining` are `null`.

**Modify** the existing `reset() returns to initial` test's assertion the same way — populate state via `applyMessage` for new fields, then `reset()`, assert all fields back to `null`.

**Append** the 4 new tests per spec section "Implementation sketches → `telemetry-store.svelte.test.ts`":

1. `applyMessage with ATTITUDE updates roll/pitch/yaw` — synthetic JSON `{ message: { type: 'ATTITUDE', roll: 0.1, pitch: -0.2, yaw: 1.5 } }`. Assert all three set.
2. `applyMessage with VFR_HUD updates groundspeed` — synthetic JSON `{ message: { type: 'VFR_HUD', groundspeed: 4.5 } }`. Assert.
3. `applyMessage with SYS_STATUS scales mV to V and stores remaining` — synthetic JSON `{ message: { type: 'SYS_STATUS', voltage_battery: 12450, battery_remaining: 87 } }`. Assert `voltageBattery === 12.45` and `batteryRemaining === 87`.
4. `applyMessage with SYS_STATUS battery_remaining=-1 stores null` — synthetic JSON `{ message: { type: 'SYS_STATUS', voltage_battery: 12450, battery_remaining: -1 } }`. Assert `voltageBattery === 12.45` and `batteryRemaining === null`.

Use the existing `beforeEach(() => reset())` discipline.

- [ ] **Step 2: Run tests, expect failures**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && pnpm --filter @gcscode/extension-sitl test telemetry-store`
Expected: the 4 new tests fail (the store doesn't have the new fields yet); the 2 modified tests fail (the new fields aren't in the initial state). Existing 7 tests still pass.

- [ ] **Step 3: Extend `telemetry-store.svelte.ts` per spec**

Implement per spec section "Implementation sketches → `packages/shell/src/extension-sitl/src/telemetry-store.svelte.ts`":

1. Extend `TelemetryState` interface with the six new optional fields, in this order: `roll`, `pitch`, `yaw`, `groundspeed`, `voltageBattery`, `batteryRemaining`. All `number | null`. Place them between the existing `heading` and `connection` fields. Field-level comments per the spec (`// radians`, `// m/s`, `// V (from voltage_battery / 1000 mV)`, `// %, null when MAVLink reports -1 (unknown)`).

2. Extend the initial-state `$state({...})` literal to include all six new fields at `null`.

3. Add three new `else if` branches to `applyMessage`'s dispatch chain — ATTITUDE, VFR_HUD, SYS_STATUS — per the spec's exact code shape. Each uses `typeof msg.<field> === 'number'` guards (mirroring the existing GLOBAL_POSITION_INT pattern) so sparse messages don't blank out fields they don't carry. The SYS_STATUS branch translates `battery_remaining === -1` to `null`.

4. Extend `reset()` body with the six new field assignments to `null`, in the same order as the interface.

- [ ] **Step 4: Extend `sitl-view.svelte` per spec**

Implement per spec section "Implementation sketches → `packages/extension-sitl/src/sitl-view.svelte`":

1. Add four new formatters in the `<script>` block, after the existing `fmtArmed`:
   - `fmtAttitude(rad: number | null): string` — `'—'` if null, else `${(rad * 180 / Math.PI).toFixed(1)}°`.
   - `fmtSpeed(mps: number | null): string` — `'—'` if null, else `${mps.toFixed(1)} m/s`.
   - `fmtVoltage(v: number | null): string` — `'—'` if null, else `${v.toFixed(2)} V`.
   - `fmtPercent(n: number | null): string` — `'—'` if null, else `${n}%`.

2. Append six new `<dt>/<dd>` pairs to the `<dl>`, after the existing Heading row, in this order: Roll, Pitch, Yaw, Groundspeed, Battery, Battery %.

The `Battery %` row uses `fmtPercent(telemetryState.batteryRemaining)`. The `Battery` row uses `fmtVoltage(telemetryState.voltageBattery)`.

- [ ] **Step 5: Extend the filter regex in `index.ts`**

In `packages/extension-sitl/src/index.ts`, change the `FILTER` constant from:

```ts
const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT)$';
```

to:

```ts
const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS)$';
```

That is the entire `index.ts` change. Do not modify any other line.

- [ ] **Step 6: Run tests, expect pass**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && pnpm --filter @gcscode/extension-sitl test telemetry-store`
Expected: 13 tests pass (9 existing + 4 new).

- [ ] **Step 7: Run the full SITL suite**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && pnpm --filter @gcscode/extension-sitl test`
Expected: 27 tests pass (13 store + 8 client + 6 index — only the store count grew).

- [ ] **Step 8: Run the full workspace**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && pnpm test`
Expected: 139 tests pass (135 prior + 4 new).

- [ ] **Step 9: Run check + lint**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && pnpm check && pnpm lint`
Expected: both clean. The view component's new formatters and rows compile cleanly under svelte-check. ESLint and Prettier clean. If Prettier complains, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 10: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && git branch --show-current && git add packages/extension-sitl/src/telemetry-store.svelte.ts packages/extension-sitl/src/telemetry-store.svelte.test.ts packages/extension-sitl/src/index.ts packages/extension-sitl/src/sitl-view.svelte && git commit -m "$(cat <<'EOF'
feat(sitl): add ATTITUDE/VFR_HUD/SYS_STATUS telemetry fields

Purely additive extension of the SITL listener. The reducer gains
three cases — ATTITUDE (roll, pitch, yaw in radians), VFR_HUD
(groundspeed in m/s), SYS_STATUS (voltageBattery from mV /1000,
batteryRemaining with -1 → null per MAVLink convention). The view
gains six rows + three formatters (fmtAttitude rad → degrees,
fmtSpeed, fmtVoltage, fmtPercent). The WebSocket filter regex
extends from ^(HEARTBEAT|GLOBAL_POSITION_INT)$ to add the three
new types — one-string edit; mavlink2rest sends what we ask for.

Four new reducer tests (one per new message type plus a
battery_remaining=-1 → null case). Two existing tests' assertions
extended to cover the new fields. SITL test count: 13 store + 8
client + 6 index = 27 (was 23). Workspace: 139 (was 135).

No structural changes. No new modules. No cross-repo work. No API
surface changes. The getLocation command's return shape is
unchanged; the new fields are not in scope for that command.

Spec: docs/specs/2026-04-28-extension-sitl-listener-fields.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify branch confirmation chained before commit reads `feat/extension-sitl-listener-fields`. If `master`, STOP and report BLOCKED.

---

### Task 3: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check + test + lint suite**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && pnpm check && pnpm test && pnpm lint`
Expected: all clean. Workspace test count: 139 (109 shell + 3 example + 27 sitl).

- [ ] **Step 2: Production build smoke test**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && pnpm --filter @gcscode/shell build`
Expected: build succeeds. Bundle delta is small (a few hundred bytes for the new view rows + formatters + reducer cases). If the bundle grew by more than ~1 kB, something unexpected pulled in a dependency — investigate.

- [ ] **Step 3: Optional dev server smoke test**

Per spec section "Verification". If `mavlink2rest` is running (via `./run_sitl.sh` in `Drone SITL`), open `http://localhost:5173` after `pnpm dev`. Confirm:

- All 12 telemetry rows render: Mode, Armed, Latitude, Longitude, Altitude, Heading, Roll, Pitch, Yaw, Groundspeed, Battery, Battery %.
- Roll/Pitch/Yaw flicker as ArduCopter's attitude estimator runs.
- Groundspeed reads `0.0 m/s` on the ground.
- Battery shows ArduCopter SITL's default — typically around `12.59 V` at `100%`.
- Connection badge shows `connected`.

If the bridge is not running, the view shows all rows as `'—'` with the `Disconnected` badge. No crash.

- [ ] **Step 4: Confirm clean tree and feature commit**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener-fields/shell && git status && git log --oneline master..HEAD`
Expected: `nothing to commit, working tree clean`. Branch contains exactly 1 new commit beyond master (Task 2). No `Code-review-followup` commits expected since this is small enough that per-task review is light or skipped.

---

## Out of scope reminders

These are intentionally NOT part of this iteration (see the spec):

- **Throttle / RC channels / GPS health.** Same shape, additive — defer.
- **Attitude rates** (rollspeed/pitchspeed/yawspeed). Same shape — defer.
- **Battery current draw / flight-time estimation.** Bigger; defer.
- **Per-row visual treatment** (color thresholds for low battery etc.). UI design iteration — defer.
- **Tests for the view component.** Same posture as the listener iteration — view changes are smoke-tested via dev server.
- **Changes to `mavlink-client.ts`, `index.test.ts`, anywhere outside `packages/extension-sitl/src/`.**
- **Cross-repo edits to `Drone SITL/run_sitl.sh`.** mavlink2rest's filter is set by the WebSocket URL query param.
- **Roadmap or out-of-scope.md propagation.** None of those bullets are touched.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note on the reducer's growth

The reducer is now ~5 cases (HEARTBEAT, GLOBAL_POSITION_INT, ATTITUDE, VFR_HUD, SYS_STATUS, plus the no-op `else`). Still small enough that an `if/else if` chain reads clearly. A lookup-table refactor (`const HANDLERS: Record<string, (msg: Record<string, unknown>) => void>`) would only become worthwhile around 8-10 cases. Don't pre-emptively refactor in this iteration.

## Cross-cutting note on MAVLink units

The store keeps source-unit values for fields the user generally doesn't talk about in radians (attitude → stored radians, displayed degrees) and converts at display time. For fields the user DOES talk about in their natural unit (`voltageBattery` in V, `groundspeed` in m/s), the store does the scaling once and the view passes through. The asymmetric rule: "the unit a person would write on a whiteboard goes to the view; MAVLink's source units only when the natural unit is what people use." This is documented in the spec's cross-cutting notes — don't break the asymmetry.

## Cross-cutting note on `battery_remaining: -1`

MAVLink's SYS_STATUS uses `int8_t battery_remaining` with `-1` reserved for "battery monitoring not active." The reducer translates `-1` to `null` so the view renders `'—'` instead of `-1%`. Test 4 (added in this iteration) pins this behavior. A future change that drops the `-1 → null` translation would surface confusing values to users; the test is the guardrail.
