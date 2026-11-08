# SITL listener — real telemetry feed

**Status:** Approved (2026-04-27)

## Context

Replaces the SITL stub's hardcoded coordinates with a live telemetry feed from the user's ArduCopter SITL + MAVProxy setup. The connection layer is `mavlink2rest` 1.0.2 — an external Rust binary that listens on UDP 14551 (the GCS port MAVProxy already routes to) and exposes a WebSocket at `ws://localhost:8088/v1/ws/mavlink`. Our extension subscribes to that WebSocket, parses the JSON envelopes, and feeds a reactive Svelte 5 store that the view renders.

This is the first feature extension consuming the `Extension.deactivate?()` hook (just shipped). The extension's `deactivate?()` awaits a clean WebSocket close. Sync teardown via Disposables alone does not suffice — closing a WebSocket is asynchronous and we want the close handshake to complete before the registry tears down the rest of the extension's contributions.

The bridge is external: we install `mavlink2rest` as a binary, configure it via CLI flags, and consume its API. We do not write a Python or Node bridge. This trade — accepting a third-party Rust binary in the user's dev setup — was chosen for zero bridge maintenance vs ~80 lines of bridge code we would otherwise write and own. The user's `Drone SITL` repo's `run_sitl.sh` gains a few lines to launch `mavlink2rest` alongside MAVProxy.

The cross-repo coupling (gcscode shell + Drone SITL launcher) is an open organizational question for after this iteration. For now the bridge launch lives in `Drone SITL` because that is where SITL is launched; the right long-term home is unsettled. Captured as a follow-up.

## Decisions deliberately out of this iteration

- **Auto-reconnect / retry on disconnect.** No backoff, no retry button, no automatic re-attempt. Connect on `activate`, close on `deactivate?()`. If the bridge is not running or drops mid-session, the view shows `Disconnected` indefinitely and the user reloads or toggles the extension off/on. Trigger to revisit: a real session where mid-flight drops are common enough to need automatic recovery.

- **Status bar item.** The view alone surfaces connection state and telemetry. Adding a status bar item is purely additive and can ship later. Trigger: a workflow where a footer-level summary saves time.

- **Map view.** A separate roadmap entry. The lat/lng cells in the view are textual (`-35.363261°` etc.); spatial visualization is a different feature.

- **Attitude / battery / groundspeed fields.** These are the "Full" telemetry set from `client/telemetry.py`. Adding them is purely additive (more cases in the reducer + more rows in the view + extending the WebSocket filter). Trigger: real consumer wants them — likely the next iteration after this lands.

- **Sending commands TO the vehicle.** No `arm`, `disarm`, `takeoff`, `set_mode`, etc. Listener-only this iteration. Trigger: a real consumer (palette command, GCS UI button) wants to issue a command. mavlink2rest's REST surface (PUT `/v1/mavlink`) is the natural plumbing when that lands.

- **Multi-vehicle support.** Single SITL feed, single store, single view. Trigger: a real multi-vehicle scenario.

- **Authentication / TLS on the WebSocket.** localhost dev only; mavlink2rest is plain HTTP. Trigger: production deployment story.

- **Mock SITL bridge for tests.** Tests use a `WebSocket` global mock; running `mavlink2rest` is a developer-time prerequisite for the dev server smoke test.

- **Cross-repo organizational decision.** Where the bridge launcher lives long-term (in `Drone SITL`, in gcscode, in a separate sitl-tooling repo) — captured as a follow-up; not decided in this iteration.

## VS Code alignment

| Concern                                                          | VS Code                                                               | Ours                                                                                 | Notes                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Extension as a feature package contributing register\* calls     | ✓ Extension Marketplace pattern                                       | ✓ `@gcscode/extension-sitl` continues to follow `@gcscode/extension-example`'s shape | Aligned. Same posture as the SITL stub iteration.                                                                                                                                                      |
| Async cleanup via `deactivate?()`                                | ✓ `deactivate?(): Thenable<void>`                                     | ✓ `deactivate?(): Promise<void>` closes the WebSocket                                | Aligned. First consumer of the hook we just shipped.                                                                                                                                                   |
| Module-level reactive state for an extension                     | VS Code extensions typically use `EventEmitter` and per-API listeners | ➤ Ours — Svelte 5 `$state` rune in a `.svelte.ts` module                             | Deliberate divergence. We are a Svelte app, not a VS Code clone — using the framework's reactivity primitive directly is simpler than wrapping it in an Emitter shape. The boundary is shell-internal. |
| Long-running connection in an extension                          | VS Code extensions can hold WebSockets / sockets freely               | ✓ Same                                                                               | Aligned.                                                                                                                                                                                               |
| Connection-lifecycle UI surface (`view: Connecting / Connected`) | VS Code typically uses status bar items + view spinners               | ✓ Connection state is a row in the view, no status bar in this iteration             | Aligned in spirit. Status bar can come later.                                                                                                                                                          |

## Goals

- Replace `packages/extension-sitl/src/location.ts` with a reactive `telemetry-store.svelte.ts` module that holds the live `TelemetryState`. The store is a singleton at module level; `activate` does not construct it, `deactivate?()` does not destroy it — it survives across enable/disable cycles.

- Add `packages/extension-sitl/src/mavlink-client.ts` with a `createMavlinkClient(options)` factory that wraps the WebSocket lifecycle. Returns a `MavlinkClient` with a `close(): Promise<void>` method that resolves when the WebSocket fires its `close` event.

- Refactor `packages/extension-sitl/src/index.ts`:
  - Remove the `SITL_LOCATION` import.
  - Inside `activate(context)`: construct the `mavlink-client` (which opens the WebSocket immediately), wire its callbacks to the store's `applyMessage` and `setConnectionState`. Push the existing three contribution disposables (view, command, keybinding).
  - The `getLocation` command's `run()` now returns `{ lat, lng, alt }` from the live store, or `null` if no `GLOBAL_POSITION_INT` has arrived yet.
  - Add `deactivate?()` hook that calls `client.close()` and awaits it. Also resets the store's connection state to `'disconnected'` and clears its position fields so a future re-activate starts from a known clean state.

- Update `packages/extension-sitl/src/sitl-view.svelte`:
  - Reactive read from the telemetry store (`<script>` imports it; the template renders fields with `?? '—'` fallbacks).
  - Six rows: mode, armed, lat, lng, alt, heading.
  - Connection state badge (Connecting / Connected / Disconnected).
  - Header: `SITL Telemetry`. The "Hardcoded ArduPilot SITL default home..." paragraph goes away.

- Bump `displayName` from `SITL Stub` to `SITL Telemetry`. The slug `gcscode.sitl` and the contribution ids (`gcscode.sitl.location`, `gcscode.sitl.getLocation`) and the keybinding (`Alt+Shift+L`) stay unchanged.

- Add tests:
  - `telemetry-store.svelte.test.ts`: pure reducer tests against synthetic JSON inputs (no WebSocket involved). Cases: HEARTBEAT updates mode + armed; GLOBAL_POSITION_INT updates lat/lng/alt/heading with correct scaling; unknown message types are ignored; `setConnectionState` updates the connection field.
  - `mavlink-client.test.ts`: mock `global.WebSocket` via `vi.stubGlobal`. Cases: client constructs WebSocket with the right URL+filter; `message` events forward parsed JSON to the callback; connection state transitions through `connecting → connected → disconnected`; `close()` returns a promise that resolves on the WebSocket `close` event; malformed JSON in a message is logged but does not crash the callback chain.
  - Existing 3 tests in `index.test.ts` updated for the new `displayName` and new `getLocation` semantics; +1-2 tests for the deactivate hook awaiting the client close.

- Update `Drone SITL/run_sitl.sh` to background `mavlink2rest` alongside MAVProxy and clean up on exit. Backgrounded subprocess, trapped via the existing `cleanup()` function.

- Doc propagation: `roadmap.md` flips the Feature-extensions `SITL listener` line to checked + spec link.

## Non-goals

- **Auto-reconnect, retry button, exponential backoff.** Manual retry only (extension toggle / page reload).
- **Status bar item.**
- **Attitude (R/P/Y), groundspeed, battery, throttle.** Single-iteration deferral.
- **Map view contribution kind.**
- **Sending commands to the vehicle.**
- **Multi-vehicle.**
- **WebSocket auth / TLS.**
- **Bundling `mavlink2rest` in our repo.** The binary is a developer prerequisite, not a deliverable.
- **Changes to `@gcscode/extension-api`.** Cross-package contract is unchanged. The hook landed last iteration; this iteration is the first consumer.
- **Changes to the registry, manager, persistence, manifest, app.svelte, main.ts, dispatcher.** All shell internals are unchanged.
- **Changes to `@gcscode/extension-example`.**
- **Tests that boot real `mavlink2rest`.** Mock `global.WebSocket` is sufficient.
- **End-to-end tests that drive a real ArduCopter SITL.** Out of scope for an automated suite; the dev server smoke test covers the integration path manually.

## Public API (extension-facing)

The extension surface contributed to the host via `host.register*` is **unchanged** apart from the `displayName` text:

| Contribution              | Before                                           | After                                             |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| Extension id              | `gcscode.sitl`                                   | `gcscode.sitl` (unchanged)                        |
| Extension `displayName`   | `SITL Stub`                                      | `SITL Telemetry`                                  |
| View id                   | `gcscode.sitl.location`                          | `gcscode.sitl.location` (unchanged)               |
| Command id                | `gcscode.sitl.getLocation`                       | `gcscode.sitl.getLocation` (unchanged)            |
| Command return value      | `{ lat: -35.363261, lng: 149.16523 }` (constant) | `{ lat, lng, alt } \| null` (live store)          |
| Keybinding                | `Alt+Shift+L`                                    | `Alt+Shift+L` (unchanged)                         |
| `Extension.deactivate?()` | (not defined)                                    | `deactivate?(): Promise<void>` — closes WebSocket |

The hook returns `Promise<void>`; the implementation `await`s `client.close()` and resets the store.

## Internal modules

### `telemetry-store.svelte.ts` (new)

Module-level singleton store using the Svelte 5 `$state` rune. The `.svelte.ts` extension is required for runes to work outside component files.

```ts
export interface TelemetryState {
  mode: string | null;
  armed: boolean | null;
  lat: number | null;
  lng: number | null;
  alt: number | null;
  heading: number | null;
  connection: 'connecting' | 'connected' | 'disconnected';
}

export const telemetryState: TelemetryState = $state({
  mode: null,
  armed: null,
  lat: null,
  lng: null,
  alt: null,
  heading: null,
  connection: 'connecting',
});

export function applyMessage(json: unknown): void;
export function setConnectionState(s: TelemetryState['connection']): void;
export function reset(): void;
```

`applyMessage(json)` dispatches on `json.message.type`:

- `HEARTBEAT`: read `base_mode` (number), `custom_mode` (number). Set `armed` from `(base_mode & 0x80) !== 0`. Set `mode` from a small ArduCopter mode-id → name map (see below); unknown ids fall back to `MODE_<id>`.
- `GLOBAL_POSITION_INT`: read `lat` (int, 1e7-scaled degrees), `lon` (int, 1e7-scaled), `relative_alt` (int, mm), `hdg` (int, centidegrees). Set `lat = lat / 1e7`, `lng = lon / 1e7`, `alt = relative_alt / 1000`, `heading = hdg / 100`.
- Anything else: ignored. No throw, no log (avoid noise during normal operation).

Malformed JSON (missing `message`, missing `message.type`, wrong types) is silently ignored. The reducer is defensive — never throws on bad input.

Mode-id map (subset of ArduCopter common modes):

```ts
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
```

Modes outside this map render as `MODE_<n>`. The map is small on purpose — adding entries is trivial and risk-free.

`reset()` returns the store to initial state (nulls + `connection: 'connecting'`). Called from the deactivate hook to avoid stale data flashing on re-activate.

`setConnectionState(s)` sets `connection`. Called by the mavlink-client.

### `mavlink-client.ts` (new)

WebSocket lifecycle wrapper. Plain `.ts` (no reactive state).

```ts
export interface MavlinkClient {
  close(): Promise<void>;
}

export function createMavlinkClient(options: {
  url: string;
  onMessage: (json: unknown) => void;
  onConnectionStateChange: (s: 'connecting' | 'connected' | 'disconnected') => void;
}): MavlinkClient;
```

Behavior:

- `createMavlinkClient(...)` constructs `new WebSocket(url)` immediately. `onConnectionStateChange('connecting')` fires synchronously.
- WebSocket `open` event → `onConnectionStateChange('connected')`.
- WebSocket `message` event → `JSON.parse(event.data)` inside try/catch. Success → `onMessage(parsed)`. Failure → `console.warn(...)` and continue. (Malformed messages are not the consumer's problem.)
- WebSocket `error` event → `console.error(...)`. The `close` event fires automatically after `error`.
- WebSocket `close` event → `onConnectionStateChange('disconnected')`. If a `close()` call is pending, resolve its promise.
- `close()` method:
  - If already closed, returns `Promise.resolve()`.
  - Otherwise calls `socket.close(1000, 'extension-deactivate')` and returns a `Promise<void>` that resolves when the `close` event fires. Stored as a deferred promise (resolver captured in a one-shot variable).
  - Idempotent: calling `close()` twice returns the same already-pending or already-resolved promise.

The WebSocket URL is the caller's responsibility. The extension's `index.ts` constructs:

```ts
const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT)$';
const url = `ws://localhost:8088/v1/ws/mavlink?filter=${encodeURIComponent(FILTER)}`;
```

### `index.ts` (modified)

```ts
import type { Extension } from '@gcscode/extension-api';

import { createMavlinkClient, type MavlinkClient } from './mavlink-client';
import SitlView from './sitl-view.svelte';
import { applyMessage, reset, setConnectionState, telemetryState } from './telemetry-store.svelte';

const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT)$';
const WS_URL = `ws://localhost:8088/v1/ws/mavlink?filter=${encodeURIComponent(FILTER)}`;

let client: MavlinkClient | null = null;

export const sitlExtension: Extension = {
  id: 'gcscode.sitl',
  displayName: 'SITL Telemetry',
  version: '0.0.0',
  activate(context) {
    client = createMavlinkClient({
      url: WS_URL,
      onMessage: applyMessage,
      onConnectionStateChange: setConnectionState,
    });

    context.subscriptions.push(
      context.host.registerView({
        id: 'gcscode.sitl.location',
        component: SitlView,
      }),
      context.host.registerCommand({
        id: 'gcscode.sitl.getLocation',
        run: () => {
          if (telemetryState.lat === null || telemetryState.lng === null) {
            console.log('SITL location: (no fix yet)');
            return null;
          }
          const loc = {
            lat: telemetryState.lat,
            lng: telemetryState.lng,
            alt: telemetryState.alt,
          };
          console.log('SITL location:', loc);
          return loc;
        },
      }),
      context.host.registerKeybinding({
        key: 'Alt+Shift+L',
        command: 'gcscode.sitl.getLocation',
      }),
    );
  },
  async deactivate() {
    if (client) {
      await client.close();
      client = null;
    }
    reset();
  },
};
```

The module-level `client` variable is null between activate cycles. The store's `reset()` is called after the close completes so the view's last-displayed values clear when the user disables the extension.

### `sitl-view.svelte` (modified)

```svelte
<script lang="ts">
  import { telemetryState } from './telemetry-store.svelte';

  function fmtCoord(n: number | null): string {
    return n === null ? '—' : `${n.toFixed(6)}°`;
  }
  function fmtAlt(n: number | null): string {
    return n === null ? '—' : `${n.toFixed(2)} m`;
  }
  function fmtHeading(n: number | null): string {
    return n === null ? '—' : `${n.toFixed(1)}°`;
  }
  function fmtArmed(b: boolean | null): string {
    return b === null ? '—' : b ? 'ARMED' : 'disarmed';
  }
</script>

<section>
  <header>
    <h2>SITL Telemetry</h2>
    <span class="status {telemetryState.connection}">
      {telemetryState.connection}
    </span>
  </header>
  <dl>
    <dt>Mode</dt>
    <dd>{telemetryState.mode ?? '—'}</dd>
    <dt>Armed</dt>
    <dd>{fmtArmed(telemetryState.armed)}</dd>
    <dt>Latitude</dt>
    <dd>{fmtCoord(telemetryState.lat)}</dd>
    <dt>Longitude</dt>
    <dd>{fmtCoord(telemetryState.lng)}</dd>
    <dt>Altitude</dt>
    <dd>{fmtAlt(telemetryState.alt)}</dd>
    <dt>Heading</dt>
    <dd>{fmtHeading(telemetryState.heading)}</dd>
  </dl>
</section>
```

No styles in this iteration — the existing app stylesheet handles the section/header/dl. Connection class names (`connecting`, `connected`, `disconnected`) are added so a future stylesheet pass can color-code them.

The reactive read works because the view imports `telemetryState` (a `$state` object) and Svelte tracks the field reads at template time.

### Removal: `location.ts`

Delete `packages/extension-sitl/src/location.ts`. The `SITL_LOCATION` constant is replaced by live state. No other module imports it after this iteration.

## Testing

### `telemetry-store.svelte.test.ts` (new)

Pure reducer tests. No `WebSocket`, no DOM, no Svelte component. Cases:

1. Initial state: all telemetry fields are `null`; `connection` is `'connecting'`.
2. `applyMessage` with HEARTBEAT (`base_mode: 0x81`, `custom_mode: 4`): `mode === 'GUIDED'`, `armed === true`. (`0x81 = SAFETY_ARMED | CUSTOM_MODE_ENABLED`.)
3. `applyMessage` with HEARTBEAT (`base_mode: 0x01`, `custom_mode: 6`): `mode === 'RTL'`, `armed === false`.
4. `applyMessage` with HEARTBEAT (`custom_mode: 999` — unknown): `mode === 'MODE_999'`.
5. `applyMessage` with GLOBAL_POSITION_INT (`lat: -353632610`, `lon: 1491652300`, `relative_alt: 5400`, `hdg: 9000`): `lat === -35.363261`, `lng === 149.165230`, `alt === 5.4`, `heading === 90.00`.
6. `applyMessage` with unknown message type: state is unchanged from before the call.
7. `applyMessage` with malformed json (missing `message`, missing `message.type`, non-object): state is unchanged; no throw.
8. `setConnectionState('connected')`: `connection === 'connected'`. Same for the other two states.
9. `reset()`: state returns to initial.

Tests reset the singleton store via `reset()` in `beforeEach`. The singleton-vs-factory choice is documented (see Cross-cutting notes); the test's `beforeEach` is the trade.

### `mavlink-client.test.ts` (new)

Tests use `vi.stubGlobal('WebSocket', MockWebSocket)` where `MockWebSocket` is a minimal class mimicking the browser WebSocket lifecycle (`readyState`, `onopen`, `onmessage`, `onerror`, `onclose`, `send`, `close`). The mock exposes hooks for tests to drive lifecycle events.

Cases:

1. `createMavlinkClient(...)` constructs WebSocket with the exact URL passed. `onConnectionStateChange('connecting')` fires synchronously.
2. `MockWebSocket` fires `open` → `onConnectionStateChange('connected')` is called.
3. `MockWebSocket` fires `message` with `data: '{"message":{"type":"HEARTBEAT"}}'` → `onMessage` called with the parsed object.
4. `MockWebSocket` fires `message` with `data: 'not json'` → `console.warn` was called; `onMessage` was NOT called; the client did not crash.
5. `MockWebSocket` fires `close` → `onConnectionStateChange('disconnected')` is called.
6. `client.close()`: returns a promise that does NOT resolve until the mock fires `close`; calling `close()` twice returns identical / already-resolved promises (idempotent); the second call does not call `socket.close` twice.
7. `client.close()` after a natural close has fired: returns an already-resolved promise.
8. `MockWebSocket` fires `error`: `console.error` was called. (The mock then fires `close` to mirror real WebSocket behavior; the promise from `close()` if any resolves on that.)

`vi.spyOn(console, 'warn')` and `vi.spyOn(console, 'error')` for the relevant tests, restored in `try/finally` per the established pattern.

### `index.test.ts` (modified)

Existing 3 tests remain conceptually but evolve:

1. `declares stable identity metadata` — assert `id === 'gcscode.sitl'`, `displayName === 'SITL Telemetry'` (was `SITL Stub`), `typeof version === 'string'`. **Modified:** displayName string updated.
2. `registers a view, a command, and a keybinding, pushing all three disposables` — unchanged in shape; the contribution ids are unchanged. **Modified:** test uses `vi.stubGlobal('WebSocket', MockWebSocket)` so `activate` does not try to open a real connection.
3. `getLocation command returns the current store location and logs it` — **Modified.** Stub the WebSocket, manually invoke the store's `applyMessage` with a synthetic GLOBAL_POSITION_INT to populate state, then call the registered command's `run()`. Assert it returns `{ lat, lng, alt }` matching the synthetic input. Then call `applyMessage` with reset state (or call `reset()` directly) and assert `run()` returns `null` and logs `'SITL location: (no fix yet)'`.

New tests (2-3):

4. `defines a deactivate hook that returns a promise` — assert `typeof sitlExtension.deactivate === 'function'`.
5. `deactivate awaits the WebSocket close` — stub WebSocket, activate, then call `await sitlExtension.deactivate?.()`. Assert the mock's `close` was called once with code `1000`. Assert the store's connection state is `'disconnected'` after the hook resolves.
6. `deactivate clears stale telemetry state` (optional) — populate the store via applyMessage, deactivate, assert `telemetryState.lat === null` after.

Total `index.test.ts`: 5-6 tests (was 3).

### Other test files

`extension-example/src/index.test.ts`, `app.test.ts`, `registry.test.ts`, `extension-manager.test.ts`, `extension-persistence.test.ts`, `extension-manifest.test.ts`, `keybinding-dispatcher.test.ts` — unaffected. None of them import from `extension-sitl`.

## Files modified / added

| Path                                                         | Change                                                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-sitl/src/telemetry-store.svelte.ts`      | **New.** `$state` singleton + `applyMessage` reducer + `setConnectionState` + `reset`. Mode-id map for ArduCopter.                            |
| `packages/extension-sitl/src/telemetry-store.svelte.test.ts` | **New.** ~9 reducer tests against synthetic JSON; no WebSocket involvement.                                                                   |
| `packages/extension-sitl/src/mavlink-client.ts`              | **New.** WebSocket wrapper with `close(): Promise<void>`. Mock-friendly interface.                                                            |
| `packages/extension-sitl/src/mavlink-client.test.ts`         | **New.** ~8 tests using `vi.stubGlobal('WebSocket', MockWebSocket)`.                                                                          |
| `packages/extension-sitl/src/index.ts`                       | Modify. Drop `location.ts` import. Wire `mavlink-client` + `telemetry-store` inside `activate`. Add `deactivate?()` hook. Update displayName. |
| `packages/extension-sitl/src/index.test.ts`                  | Modify. Update the 3 existing tests for the new displayName + live `getLocation`. Add 2-3 tests for the deactivate hook.                      |
| `packages/extension-sitl/src/sitl-view.svelte`               | Modify. Reactive read from telemetry store. Six rows + connection badge. Drop the placeholder paragraph.                                      |
| `packages/extension-sitl/src/location.ts`                    | **Delete.** `SITL_LOCATION` constant is replaced by live state.                                                                               |
| `Drone SITL/run_sitl.sh`                                     | **Cross-repo modify.** Background `mavlink2rest` alongside MAVProxy; trap cleanup.                                                            |
| `docs/roadmap.md`                                            | Flip Feature-extensions `SITL listener` line to checked + spec link.                                                                          |

No changes to:

- `@gcscode/extension-api` — cross-package contract.
- `@gcscode/extension-example`.
- `packages/shell/src/extension-host/` (registry, manager, persistence, manifest) or their tests.
- `packages/shell/src/main.ts`, `app.svelte`, `app.test.ts`, `keybinding-dispatcher.ts` or its test.
- `docs/out-of-scope.md` — none of its bullets are touched. (The SITL stub bullet that mentioned "real telemetry pending" was internal to that spec, not in the canonical out-of-scope list.)
- Any ADR.

## Cross-repo: `Drone SITL/run_sitl.sh` changes

The script currently launches SITL (background) then MAVProxy (foreground). After this iteration, it also launches `mavlink2rest` (background) before MAVProxy starts so the bridge is up by the time MAVProxy begins routing.

Add three things to the existing script:

1. **Pre-launch check** that `mavlink2rest` is on the PATH:

   ```bash
   if ! command -v mavlink2rest >/dev/null 2>&1; then
     echo "ERROR: mavlink2rest not on PATH. Install:" >&2
     echo "    https://github.com/mavlink/mavlink2rest/releases" >&2
     exit 1
   fi
   ```

2. **Background launch** of `mavlink2rest` after SITL is up (TCP 5760) but before MAVProxy starts the foreground routing. The `--connect udpin:127.0.0.1:14551` flag makes it consume the GCS port that MAVProxy already routes to.

   ```bash
   M2R_LOG="/tmp/mavlink2rest.log"
   echo "==> Starting mavlink2rest"
   echo "    listen   : udp 14551 (GCS port)"
   echo "    serve    : http://127.0.0.1:8088 (REST + ws://.../v1/ws/mavlink)"
   echo "    log      : ${M2R_LOG}"
   mavlink2rest \
     --connect "udpin:127.0.0.1:14551" \
     --server "127.0.0.1:8088" \
     >"${M2R_LOG}" 2>&1 &
   M2R_PID=$!
   ```

3. **Cleanup hook extension** so Ctrl-C tears down `mavlink2rest` along with SITL. Extend the existing `cleanup()` function:
   ```bash
   if [[ -n "${M2R_PID:-}" ]] && kill -0 "${M2R_PID}" 2>/dev/null; then
     printf "==> Stopping mavlink2rest (PID %s)\n" "${M2R_PID}"
     kill "${M2R_PID}" 2>/dev/null || true
     wait "${M2R_PID}" 2>/dev/null || true
   fi
   ```

The existing SITL cleanup logic stays unchanged. Order of teardown on EXIT: mavlink2rest first (it depends on the SITL UDP feed via MAVProxy; reverse-startup-order shutdown), then SITL.

## `docs/roadmap.md` propagation

Find the existing line under "Feature extensions → Coming":

```md
- [ ] **SITL listener** — software-in-the-loop data-feed listener. First consumer of `Extension.deactivate?()` hook (will hold a connection that needs explicit close); likely first to want a Phase C streaming/connection service.
```

Replace with:

```md
- [x] **SITL listener** — live ArduCopter telemetry via mavlink2rest WebSocket bridge; `gcscode.sitl` extension consumes HEARTBEAT + GLOBAL_POSITION_INT; first consumer of `Extension.deactivate?()` hook. Spec: [`specs/2026-04-27-extension-sitl-listener.md`](specs/2026-04-27-extension-sitl-listener.md)
```

The "SITL stub" line above stays unchanged. The Map and Video feed lines stay unchanged. Considering, Maintenance — unchanged.

## Verification

- `pnpm check` clean across all 4 packages.
- `pnpm test` — all existing tests pass; new tests in `telemetry-store.svelte.test.ts`, `mavlink-client.test.ts`, and modified `index.test.ts` pass. Workspace test count grows by ~12-15 (9 store + 8 client + 2-3 new index).
- `pnpm lint` clean.
- `pnpm --filter @gcscode/shell build` succeeds.
- `pnpm dev` smoke test (the integration check):
  1. Start `./run_sitl.sh` in the `Drone SITL` repo. Verify SITL + MAVProxy + mavlink2rest all come up. Verify `curl http://localhost:8088/v1/info` returns a JSON document.
  2. Start `pnpm dev` in `gcscode/shell`. Open `http://localhost:5173/`.
  3. SITL Telemetry view shows `connecting` briefly, then `connected`. Mode populates with `STABILIZE` (or whatever ArduCopter boots into). Lat/Lng/Alt populate with the home location values within a few seconds. Heading populates.
  4. In MAVProxy: `mode GUIDED`. View's mode field updates to `GUIDED` within ~1 sec.
  5. Toggle the extension off via... wait, no toggle UI exists yet. The dev server smoke test for disable/re-enable is deferred until a toggle UI lands. The deactivate hook is exercised by the test suite instead.
  6. Press `Alt+Shift+L`. Console logs the current `{ lat, lng, alt }`.
  7. Stop `mavlink2rest` manually (or `Ctrl-C` on `run_sitl.sh`). View transitions to `disconnected`. Reload the page to recover (no auto-reconnect this iteration).

If `mavlink2rest` is not running when `pnpm dev` starts, the view shows `Disconnected` immediately (WebSocket constructor fires `error` then `close` synchronously). No crashes; the rest of the app continues to work.

## Follow-ups (out of scope for this iteration)

- **Auto-reconnect with backoff.** When mid-flight drops happen often enough to need recovery.
- **Status bar item** — `SITL: 35.36°/149.17°` or similar live footer summary.
- **Attitude (R/P/Y), groundspeed, throttle, battery.** Extend the WebSocket filter and add cases to the reducer + rows to the view.
- **Map view contribution** — spatial visualization. Separate iteration / contribution kind.
- **Send commands to the vehicle** — arm, takeoff, set_mode. mavlink2rest's REST `PUT /v1/mavlink` is the bridge; needs a command palette UI or similar trigger surface.
- **Multi-vehicle support.**
- **Phase C streaming / connection-service primitive.** When a second extension also wants long-running connection management — likely the video-feed extension. The mavlink-client could be promoted to a shell-level service (`host.openWebSocket(...)`) at that point.
- **Cross-repo organizational decision.** Where the bridge launcher (`run_sitl.sh`'s mavlink2rest invocation) lives long-term: stay in the `Drone SITL` repo (status quo), move into `gcscode` (closer to the consumer), or extract to a separate `sitl-tooling` repo. Open after this iteration ships and the integration is exercised.
- **Mock SITL bridge for end-to-end tests.** A small Node program that fakes mavlink2rest's WebSocket output so we can run integration tests in CI without a real ArduCopter SITL.

## Cross-cutting notes

**Singleton telemetry store.** The store is module-level and persists across activate/deactivate cycles. Re-activating the extension reuses the same store instance, calling `reset()` first (which clears stale state) and then opens a fresh WebSocket. The alternative — factory pattern with the store created inside `activate` — would force the view component to read from a runtime-bound reference, which Svelte doesn't natively support without prop-drilling or context. Singleton is the path of least resistance here. If a future SITL listener needs multi-feed support, that's a separate iteration.

**`.svelte.ts` extension.** Required for the `$state` rune to work in non-component files (Svelte 5 convention). The TypeScript glob `src/**/*.ts` in `tsconfig.json` covers `*.svelte.ts` because the literal extension is still `.ts`. svelte-check picks it up via its own globbing. No tooling change needed.

**WebSocket in tests.** Vitest's default `node` environment does not provide a global `WebSocket`. The two new test files (`telemetry-store.svelte.test.ts`, `mavlink-client.test.ts`) take different approaches: the store tests don't touch WebSocket; the client tests stub it via `vi.stubGlobal('WebSocket', MockWebSocket)`. The `MockWebSocket` class lives at the top of the client test file (or in a small fixture if it's worth sharing). The `index.test.ts` tests also need the stub when calling `activate` because `createMavlinkClient` opens a connection at construction.

**Connection state vs WebSocket readyState.** The store's `connection` field is the user-facing summary: `connecting`, `connected`, `disconnected`. The mavlink-client maps WebSocket events to those three. We deliberately don't surface intermediate states (`closing`) — they would flicker in the UI without adding information.

**Module-level `client` variable in `index.ts`.** The `let client: MavlinkClient | null = null;` is mutable module state. Re-activate replaces it; deactivate sets it back to null after the close completes. Tests need to be aware that `index.ts`'s module-level state persists across tests in the same file — `beforeEach` should reset by calling `sitlExtension.deactivate?.()` if a previous test activated.

**Bridge configuration is hardcoded.** The WebSocket URL `ws://localhost:8088/v1/ws/mavlink?filter=...` is a constant in `index.ts`. There is no extension setting / config UI to change it. Trigger to revisit: a real consumer wants a non-default mavlink2rest port, or the bridge moves to a remote host. The Phase C settings iteration is the natural place to surface this.

**Mode-id map is ArduCopter-specific.** A different vehicle type (ArduPlane, ArduRover) has a different mode ID space. The map covers ArduCopter common modes; ArduPlane mode 4 means something different. We do not detect vehicle type from `HEARTBEAT.type` and switch maps. Trigger to revisit: a non-Copter SITL becomes a tested target. The fallback `MODE_<id>` for unknown ids keeps the view honest in the meantime.

**Test count expectation for the next implementer.** After this iteration, `extension-sitl` has `~5 + 9 + 8 = 22` tests (was 3). The workspace total after merge depends on what else has shipped between now and then; the implementer should compute the expected count from the post-merge baseline and adjust the plan's expected counts accordingly.
