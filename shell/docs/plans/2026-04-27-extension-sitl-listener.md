# SITL listener — real telemetry feed implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SITL stub's hardcoded coordinates with a live telemetry feed from `mavlink2rest` 1.0.2 over WebSocket. New reactive `telemetry-store.svelte.ts`, new `mavlink-client.ts`, refactored `index.ts` with `deactivate?()` hook awaiting clean WebSocket close, updated view with live values + connection badge. Cross-repo edit to `Drone SITL/run_sitl.sh` to launch `mavlink2rest` alongside MAVProxy.

**Architecture:** Three new modules in `packages/extension-sitl/src/`. The store is a Svelte 5 `$state` module-level singleton (in a `.svelte.ts` file) that survives across activate/deactivate cycles. The client wraps the WebSocket lifecycle with an awaitable `close()`. The extension's `activate` constructs the client and wires it to the store; `deactivate?()` awaits the close and resets the store. View reads the store reactively. The `mavlink2rest` binary (already installed at `~/.cargo/bin/mavlink2rest`) is launched by the user's `run_sitl.sh` — not bundled by us.

**Tech Stack:** TypeScript, Svelte 5 (`$state` rune in `.svelte.ts` files), Vitest with `vi.stubGlobal('WebSocket', MockWebSocket)`, `mavlink2rest` 1.0.2 binary at `udpin:127.0.0.1:14551 → ws://localhost:8088/v1/ws/mavlink`.

**Spec:** `docs/specs/2026-04-27-extension-sitl-listener.md` (commit `2120a69`). The spec is the canonical reference for module shapes, reducer logic, and test cases. This plan sequences the work, gives exact commands, and points at spec sections rather than re-pasting them.

**Reference module for the existing stub:** `packages/extension-sitl/src/` — current state has `index.ts`, `index.test.ts`, `location.ts`, `sitl-view.svelte`. After this iteration, `location.ts` is deleted; the rest are modified or extended.

**ADRs to be aware of:** ADR-0001 (workspace boundary — `@gcscode/extension-api` is unchanged this iteration), ADR-0002 (imperative activate API), ADR-0003 (Phase B framing — this iteration is the first feature consumer of the deactivate hook), ADR-0004 (extension rename). No ADR is modified.

---

## File structure

| Path                                                         | Responsibility                                                                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-sitl/src/telemetry-store.svelte.ts`      | **New.** Module-level `$state` singleton + pure `applyMessage(json)` reducer + `setConnectionState(s)` + `reset()`. Mode-id map for ArduCopter. (Task 2.)   |
| `packages/extension-sitl/src/telemetry-store.svelte.test.ts` | **New.** ~9 reducer tests against synthetic JSON inputs. No WebSocket. (Task 2.)                                                                            |
| `packages/extension-sitl/src/mavlink-client.ts`              | **New.** `createMavlinkClient(opts)` factory wrapping the WebSocket lifecycle. `close(): Promise<void>` resolves on the WebSocket `close` event. (Task 3.)  |
| `packages/extension-sitl/src/mavlink-client.test.ts`         | **New.** ~8 tests with `vi.stubGlobal('WebSocket', MockWebSocket)`. (Task 3.)                                                                               |
| `packages/extension-sitl/src/index.ts`                       | Modify. Drop `SITL_LOCATION` import. Wire `mavlink-client` + `telemetry-store` inside `activate`. Add `deactivate?()` hook. Update `displayName`. (Task 4.) |
| `packages/extension-sitl/src/index.test.ts`                  | Modify. Update existing 3 tests for new `displayName` + live `getLocation` semantics. Add 2-3 tests for the deactivate hook. (Task 4.)                      |
| `packages/extension-sitl/src/sitl-view.svelte`               | Modify. Reactive read from telemetry store. Six rows + connection badge. Drop placeholder paragraph. (Task 4.)                                              |
| `packages/extension-sitl/src/location.ts`                    | **Delete.** `SITL_LOCATION` constant replaced by live state. (Task 4.)                                                                                      |
| `Drone SITL/run_sitl.sh` (cross-repo)                        | **Cross-repo modify.** Pre-launch check for `mavlink2rest` on PATH; background-launch alongside MAVProxy; cleanup on EXIT. (Task 5.)                        |
| `docs/roadmap.md`                                            | Flip Feature-extensions `SITL listener` line to checked + spec link. (Task 6.)                                                                              |

No changes to `@gcscode/extension-api`, `@gcscode/extension-example`, registry, manager, persistence, manifest, `app.svelte`, `app.test.ts`, `main.ts`, dispatcher, `docs/out-of-scope.md`, or any ADR.

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree on the feature branch**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `feat/extension-sitl-listener`. If branch is `master`, STOP — report BLOCKED.

(Per CLAUDE.md "Subagent worktree discipline" — every bash call begins with `cd <worktree>/shell &&`. The pattern is repeated in every task.)

- [ ] **Step 2: Verify all tests pass before changes**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm test`
Expected: 115 tests pass — 109 in `@gcscode/shell` (50 in `registry.test.ts`, 8 in `app.test.ts`, 27 in `keybinding-dispatcher.test.ts`, 14 in `extension-manager.test.ts`, 8 in `extension-persistence.test.ts`, 2 in `extension-manifest.test.ts`), 3 in `@gcscode/extension-example`, 3 in `@gcscode/extension-sitl`.

- [ ] **Step 3: Verify check + lint clean**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

---

### Task 2: Add `telemetry-store.svelte.ts` + reducer tests (TDD)

**Files:**

- Create: `packages/extension-sitl/src/telemetry-store.svelte.ts`
- Create: `packages/extension-sitl/src/telemetry-store.svelte.test.ts`

This task ships the pure data layer first — no WebSocket involvement. The store is a module-level `$state` singleton in a `.svelte.ts` file (Svelte 5 convention for runes outside component files). Tests are pure functions of synthetic JSON inputs.

- [ ] **Step 1: Write the 9 failing reducer tests**

Implement `telemetry-store.svelte.test.ts` per spec section "Testing → `telemetry-store.svelte.test.ts`". The test file imports from `./telemetry-store.svelte` (note the `.svelte.ts` source extension; the import omits the `.ts` per TS convention).

Use `beforeEach(() => reset())` to clear the singleton state between tests — the spec's "Cross-cutting notes → Singleton telemetry store" explains why. Synthetic JSON inputs match the mavlink2rest envelope shape `{ header: {...}, message: { type: <name>, ...fields }, message_information: {...} }` per the spec.

The 9 cases (full descriptions in the spec):

1. Initial state — all telemetry fields `null`; `connection === 'connecting'`.
2. HEARTBEAT with armed + GUIDED.
3. HEARTBEAT with disarmed + RTL.
4. HEARTBEAT with unknown mode id → `MODE_999`.
5. GLOBAL_POSITION_INT with correct scaling (`/1e7`, `/1000`, `/100`).
6. Unknown message type ignored.
7. Malformed JSON ignored (no throw).
8. `setConnectionState` transitions through all three states.
9. `reset()` returns to initial.

- [ ] **Step 2: Run tests, expect failures**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm --filter @gcscode/extension-sitl test telemetry-store`
Expected: tests fail with import resolution errors — `telemetry-store.svelte.ts` does not yet exist.

- [ ] **Step 3: Create `telemetry-store.svelte.ts` per spec**

Implement per spec section "Internal modules → `telemetry-store.svelte.ts`". The full module shape, reducer behavior, and ArduCopter mode-id map are in the spec. Key invariants:

- `telemetryState` is a module-level `$state` declaration. Single instance, exported.
- `applyMessage(json)` is defensive — never throws on bad input; bad inputs are silently ignored.
- HEARTBEAT armed bit: `(base_mode & 0x80) !== 0`.
- GLOBAL_POSITION_INT scaling: lat/lon by `1e7`, relative_alt by `1000`, hdg by `100`.
- Mode map covers the ArduCopter common subset listed in the spec; unknown modes render as `MODE_<id>`.
- `reset()` clears all telemetry to nulls and sets `connection: 'connecting'`.

The file extension MUST be `.svelte.ts` so the `$state` rune is processed. Vite's Svelte plugin and svelte-check both recognize this convention.

- [ ] **Step 4: Run tests, expect pass**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm --filter @gcscode/extension-sitl test telemetry-store`
Expected: 9 tests pass.

- [ ] **Step 5: Run full workspace tests**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm test`
Expected: 124 tests pass (115 prior + 9 new in telemetry-store).

- [ ] **Step 6: Run check + lint**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm check && pnpm lint`
Expected: both clean. svelte-check picks up `.svelte.ts` files via its glob; tsc picks them up via the existing `src/**/*.ts` pattern in `tsconfig.json` (the `.svelte.ts` extension is still `.ts` for glob purposes). If svelte-check complains about runes-in-non-svelte-file, the file extension is wrong — confirm `.svelte.ts`, not `.ts`.

If Prettier complains, run `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm format` then re-run `pnpm lint`.

- [ ] **Step 7: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && git branch --show-current && git add packages/extension-sitl/src/telemetry-store.svelte.ts packages/extension-sitl/src/telemetry-store.svelte.test.ts && git commit -m "$(cat <<'EOF'
feat(sitl): add telemetry-store with pure reducer

Module-level $state singleton in telemetry-store.svelte.ts holding
TelemetryState (mode, armed, lat, lng, alt, heading, connection).
applyMessage(json) defensively dispatches on json.message.type:
HEARTBEAT updates mode + armed (via base_mode bit + ArduCopter
mode-id map), GLOBAL_POSITION_INT updates lat/lng/alt/heading with
the conventional /1e7, /1000, /100 scaling. Unknown messages and
malformed input are silently ignored.

setConnectionState(s) and reset() round out the surface. The
.svelte.ts extension is required for $state runes outside .svelte
component files (Svelte 5 convention).

Nine pure-reducer tests cover initial state, HEARTBEAT in two
configurations, unknown mode fallback, GLOBAL_POSITION_INT scaling,
unknown-message ignore, malformed-input safety, connection-state
transitions, and reset.

mavlink-client and the index.ts wiring land in follow-up commits;
this commit is data-layer only.

Spec: docs/specs/2026-04-27-extension-sitl-listener.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify the branch confirmation chained before commit reads `feat/extension-sitl-listener`. If `master`, STOP and report BLOCKED.

---

### Task 3: Add `mavlink-client.ts` + WebSocket-mock tests (TDD)

**Files:**

- Create: `packages/extension-sitl/src/mavlink-client.ts`
- Create: `packages/extension-sitl/src/mavlink-client.test.ts`

This task ships the WebSocket lifecycle wrapper. Tests use a mock `WebSocket` via `vi.stubGlobal('WebSocket', MockWebSocket)` — the runtime's actual WebSocket is never opened.

- [ ] **Step 1: Write the 8 failing client tests**

Implement `mavlink-client.test.ts` per spec section "Testing → `mavlink-client.test.ts`". The test file:

1. Defines a `MockWebSocket` class mimicking the browser WebSocket (constructor stores URL, exposes `readyState`, `onopen`/`onmessage`/`onerror`/`onclose`, `send`, `close`). The mock's `close()` does NOT immediately fire the close event — tests drive the lifecycle manually via methods like `mock._fireOpen()`, `mock._fireMessage(data)`, `mock._fireError()`, `mock._fireClose()`.
2. Stubs the global before each test: `beforeEach(() => vi.stubGlobal('WebSocket', MockWebSocket))`. Restores via `afterEach(() => vi.unstubAllGlobals())`.
3. Captures the most recently constructed mock via a module-level `let lastMock: MockWebSocket | null = null;` set inside the constructor.

The 8 cases (full descriptions in the spec). For brevity here, key assertions:

1. URL construction — exact match on the URL passed to `createMavlinkClient`. `onConnectionStateChange('connecting')` fires synchronously (during construction).
2. `_fireOpen()` → `onConnectionStateChange('connected')`.
3. `_fireMessage('{"message":{"type":"HEARTBEAT"}}')` → `onMessage` called with the parsed object.
4. `_fireMessage('not json')` → `console.warn` called; `onMessage` NOT called.
5. `_fireClose()` → `onConnectionStateChange('disconnected')`.
6. `client.close()` returns a promise that does NOT resolve until `_fireClose()` fires; calling `close()` twice returns the same / already-resolved promise; `socket.close` was called exactly once.
7. `client.close()` after a natural close: returns an already-resolved promise.
8. `_fireError()` → `console.error` was called.

For `console.warn`/`console.error` spies: `vi.spyOn(console, 'warn').mockImplementation(() => {})` with `mockRestore()` in a `try/finally` (B1's pattern, used by `extension-manager.test.ts:794`).

- [ ] **Step 2: Run tests, expect failures**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm --filter @gcscode/extension-sitl test mavlink-client`
Expected: tests fail with import resolution errors — `mavlink-client.ts` does not yet exist.

- [ ] **Step 3: Create `mavlink-client.ts` per spec**

Implement per spec section "Internal modules → `mavlink-client.ts`". Plain `.ts`, not `.svelte.ts` — no reactive state.

Key invariants:

- `createMavlinkClient(opts)` constructs `new WebSocket(opts.url)` synchronously and fires `opts.onConnectionStateChange('connecting')` before returning.
- WebSocket `open` → `onConnectionStateChange('connected')`.
- WebSocket `message` → `JSON.parse(event.data)` inside try/catch. Success → `onMessage(parsed)`. Failure → `console.warn(...)`.
- WebSocket `error` → `console.error(...)`. The `close` event follows naturally from the WebSocket spec; we do NOT call `close()` ourselves on error.
- WebSocket `close` → `onConnectionStateChange('disconnected')`. If a `close()` call from the consumer is pending, resolve its promise.
- `close()`: capture a deferred resolver; call `socket.close(1000, 'extension-deactivate')`; return the deferred promise. If the WebSocket has already closed, return `Promise.resolve()` immediately. Idempotent — second `close()` returns the same / already-resolved promise.

The `close()` idempotence is important — the `deactivate?()` hook in Task 4 may end up calling close on an already-closed socket if the bridge dropped naturally before deactivate ran.

- [ ] **Step 4: Run tests, expect pass**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm --filter @gcscode/extension-sitl test mavlink-client`
Expected: 8 tests pass.

- [ ] **Step 5: Run full workspace tests**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm test`
Expected: 132 tests pass (124 prior + 8 new in mavlink-client).

- [ ] **Step 6: Run check + lint**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm check && pnpm lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && git branch --show-current && git add packages/extension-sitl/src/mavlink-client.ts packages/extension-sitl/src/mavlink-client.test.ts && git commit -m "$(cat <<'EOF'
feat(sitl): add mavlink-client WebSocket wrapper

createMavlinkClient(opts) factory wrapping the browser WebSocket
lifecycle: opens the socket synchronously and fires
onConnectionStateChange('connecting'); maps open/message/error/close
events to onConnectionStateChange + onMessage callbacks; provides
an idempotent close(): Promise<void> that resolves when the
WebSocket fires its close event. Malformed JSON in messages is
logged and dropped; consumers never see bad input. Plain .ts,
no reactive state — wiring into the store happens in index.ts.

Eight tests using vi.stubGlobal('WebSocket', MockWebSocket) cover
URL construction + connecting state, open transition, message
forwarding, malformed JSON handling, close transition, close()
promise + idempotence, close-after-natural-close, and error
logging.

The index.ts refactor that wires this client to the telemetry
store and registers the deactivate hook lands in the next commit.

Spec: docs/specs/2026-04-27-extension-sitl-listener.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify branch confirmation reads `feat/extension-sitl-listener`.

---

### Task 4: Refactor `index.ts` + view + delete `location.ts` + update tests

**Files:**

- Modify: `packages/extension-sitl/src/index.ts`
- Modify: `packages/extension-sitl/src/index.test.ts`
- Modify: `packages/extension-sitl/src/sitl-view.svelte`
- Delete: `packages/extension-sitl/src/location.ts`

This is the integration task — wires the store + client together inside the extension's `activate`, adds the `deactivate?()` hook, removes the old constant, updates the view to read from the store, and updates the existing tests for the new shape. One commit, codebase ends in working state.

- [ ] **Step 1: Update `index.test.ts` for the new shape**

Rewrite the existing 3 tests + add 2-3 new tests per spec section "Testing → `index.test.ts`". The test file gains:

- A `MockWebSocket` import or local definition (or copy the mock from `mavlink-client.test.ts` — see the cross-cutting note below). Stub via `vi.stubGlobal('WebSocket', MockWebSocket)` in `beforeEach` and `vi.unstubAllGlobals()` in `afterEach`.
- A `beforeEach` call to `reset()` from the telemetry store — `index.test.ts` and `mavlink-client.test.ts` share the singleton store via module imports, and tests that activate the extension must start from a clean state.
- A `beforeEach` (or `afterEach`) call to `await sitlExtension.deactivate?.()` if a previous test activated the extension — `index.ts` keeps a module-level `client` reference that persists between tests in the same file run.

The 6 cases (full descriptions in the spec):

1. `declares stable identity metadata` — `id === 'gcscode.sitl'`, `displayName === 'SITL Telemetry'` (was `SITL Stub`), `typeof version === 'string'`.
2. `registers a view, a command, and a keybinding, pushing all three disposables` — same shape as the stub iteration. Uses the WebSocket stub.
3. `getLocation command returns current store location and logs it` — populate via `applyMessage` with a synthetic GLOBAL_POSITION_INT, then call the registered command's `run()`. Assert it returns `{ lat, lng, alt }` matching the synthetic input. Then `reset()` and assert `run()` returns `null` and logs `'SITL location: (no fix yet)'`.
4. `defines a deactivate hook that returns a promise` — `typeof sitlExtension.deactivate === 'function'`; calling it returns a Promise.
5. `deactivate awaits the WebSocket close` — activate the extension, then `await sitlExtension.deactivate?.()`. Assert the `MockWebSocket` instance had its `close` method called with code `1000`. Assert the store's `connection === 'disconnected'`.
6. `deactivate clears stale telemetry state` — activate, populate via `applyMessage`, deactivate, assert `telemetryState.lat === null` etc.

The MockWebSocket can be duplicated locally in `index.test.ts` for now — the cross-cutting note below addresses sharing it.

- [ ] **Step 2: Update `sitl-view.svelte` per spec**

Implement per spec section "Internal modules → `sitl-view.svelte` (modified)". The view:

- Imports `telemetryState` from `./telemetry-store.svelte`.
- Defines four format helpers (`fmtCoord`, `fmtAlt`, `fmtHeading`, `fmtArmed`) — pure functions returning `'—'` for `null` inputs.
- Renders a `<header>` with `<h2>SITL Telemetry</h2>` and a connection-state span.
- Renders six `<dt>/<dd>` pairs: Mode, Armed, Latitude, Longitude, Altitude, Heading.
- No `<style>` block — the existing app stylesheet handles section/dl layout.
- The connection state span gets a class matching its current value (`connecting` / `connected` / `disconnected`) so a future stylesheet pass can color-code.

Drop the old `<p>Hardcoded ArduPilot SITL default home...</p>` paragraph entirely. Drop the import of `SITL_LOCATION` (which is being deleted in Step 3).

The reactive read works via field access in the template — Svelte 5 tracks reads to `$state` properties at compile time.

- [ ] **Step 3: Delete `packages/extension-sitl/src/location.ts`**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && rm packages/extension-sitl/src/location.ts`

The constant has no remaining consumers — the view (Step 2) and the index (Step 4) both stop importing it.

- [ ] **Step 4: Modify `index.ts` per spec**

Implement per spec section "Internal modules → `index.ts` (modified)". Key changes vs the current stub:

- Drop `import { SITL_LOCATION } from './location';`.
- Add imports: `createMavlinkClient`, `MavlinkClient` type from `./mavlink-client`; `applyMessage`, `reset`, `setConnectionState`, `telemetryState` from `./telemetry-store.svelte`.
- Module-level constants: `FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT)$'`, `WS_URL = \`ws://localhost:8088/v1/ws/mavlink?filter=${encodeURIComponent(FILTER)}\``.
- Module-level mutable: `let client: MavlinkClient | null = null;`.
- Inside `activate(context)`: construct the client and assign to `client`. Push the existing three contributions (view, command, keybinding) — view component import stays `SitlView from './sitl-view.svelte'`.
- The `getLocation` command's `run()` body now reads from `telemetryState`. If `telemetryState.lat === null || telemetryState.lng === null`, log `'SITL location: (no fix yet)'` and return `null`. Otherwise log + return `{ lat, lng, alt }` from the store.
- Update `displayName` to `'SITL Telemetry'`.
- Add `async deactivate()` method on the exported extension. Body: if `client` is non-null, `await client.close()` and set `client = null`. Then call `reset()`.

The `deactivate` is `async` so its return type is `Promise<void>` — matching the `void | Promise<void>` shape on `Extension.deactivate?()`.

- [ ] **Step 5: Run the index tests**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm --filter @gcscode/extension-sitl test index`
Expected: 6 tests pass (was 3; net +3 from new deactivate-hook coverage and the split getLocation behavior).

- [ ] **Step 6: Run full workspace tests**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm test`
Expected: 135 tests pass (132 prior + 3 net new in index — was 3, now 6).

The breakdown: 109 shell + 3 example + 23 SITL (6 index + 9 store + 8 client) = 135.

- [ ] **Step 7: Run check + lint**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm check && pnpm lint`
Expected: both clean. The deletion of `location.ts` is automatically picked up by `git rm` semantics; no orphan references should remain in any source file.

- [ ] **Step 8: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && git branch --show-current && git add packages/extension-sitl/src/index.ts packages/extension-sitl/src/index.test.ts packages/extension-sitl/src/sitl-view.svelte && git rm packages/extension-sitl/src/location.ts && git commit -m "$(cat <<'EOF'
feat(sitl): wire telemetry store + mavlink client; add deactivate hook

The integration commit. index.ts now constructs the mavlink-client
inside activate (which opens the WebSocket synchronously), wiring
its onMessage/onConnectionStateChange callbacks to the telemetry
store. The getLocation command reads { lat, lng, alt } from the
live store (or returns null + logs '(no fix yet)' when no
GLOBAL_POSITION_INT has arrived). displayName changes from
'SITL Stub' to 'SITL Telemetry'.

The deactivate hook (Promise<void>) awaits client.close() and then
calls store.reset() so a future re-activate starts from a clean
state. First feature extension consuming the
Extension.deactivate?() hook shipped last iteration.

sitl-view.svelte renders six telemetry rows (mode, armed, lat,
lng, alt, heading) + a connection badge, all reading reactively
from $state via the template's field reads. The hardcoded
location paragraph is gone.

location.ts (and the SITL_LOCATION constant) is deleted. Three
tests in index.test.ts updated for the new shape; three new tests
cover deactivate hook behavior. Tests stub global.WebSocket via
vi.stubGlobal so no real connection is attempted.

Spec: docs/specs/2026-04-27-extension-sitl-listener.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify branch confirmation reads `feat/extension-sitl-listener`.

---

### Task 5: Cross-repo edit — `Drone SITL/run_sitl.sh`

**Files (different git repository):**

- Modify: `~/Documents/Claude/Projects/Drone SITL/run_sitl.sh`

This task operates in a DIFFERENT git repository than the rest of the iteration. The `Drone SITL` repo at `~/Documents/Claude/Projects/Drone SITL` is the user's separate ArduPilot/MAVProxy project; we update its launcher to background `mavlink2rest` alongside MAVProxy.

**Important context for the implementer:**

- This task is independent of the gcscode worktree. Do NOT operate from the gcscode worktree path.
- The `Drone SITL` repo path contains a SPACE — quote the path in every command.
- Verify `~/Documents/Claude/Projects/Drone SITL` exists, is a git repository, and has a clean working tree before starting.
- This task may be a strong human-handoff candidate (the controller can offer the user the option to apply the change manually). If executed by a subagent, follow the steps below carefully.

- [ ] **Step 1: Verify the cross-repo state**

Run: `cd "$HOME/Documents/Claude/Projects/Drone SITL" && pwd && git status && git branch --show-current`
Expected: cwd ends in `Drone SITL`, working tree clean, branch is whatever the user has there (not asserted — this is their repo). If the working tree is not clean, STOP and report BLOCKED — we don't want to mix our changes with their in-flight work.

- [ ] **Step 2: Verify `mavlink2rest` is on PATH**

Run: `command -v mavlink2rest && mavlink2rest --version`
Expected: a path (likely `~/.cargo/bin/mavlink2rest`) and `mavlink2rest 1.0.2 (...)`. If the binary is missing, STOP — the user must install it before this iteration's smoke test can pass. Earlier in the conversation, the binary was downloaded from the v1.0.2 GitHub release.

- [ ] **Step 3: Apply the three edits to `run_sitl.sh` per spec**

Per spec section "Cross-repo: `Drone SITL/run_sitl.sh` changes", make three additions to the existing script. Read the spec section for the exact bash text — do not improvise.

The edits are:

1. **Pre-launch check.** Add a `command -v mavlink2rest` guard near the existing `[[ -x "${SITL_BIN}" ]]` check. If missing, error out with an install hint and exit 1. Keep the message format consistent with the existing error handling.

2. **Background launch.** After the SITL TCP-5760-ready loop succeeds (and before MAVProxy starts), add a block that backgrounds `mavlink2rest --connect "udpin:127.0.0.1:14551" --server "127.0.0.1:8088"` with stdout/stderr to `/tmp/mavlink2rest.log`. Capture the PID into `M2R_PID`. Add a small `echo` block describing what was started, mirroring the SITL `echo` block style.

3. **Cleanup hook extension.** Inside the existing `cleanup()` function, after the SITL teardown, add a parallel block that kills `${M2R_PID}` if set and alive. Same kill/wait pattern as the SITL block.

The existing SITL launch logic stays unchanged. Order of teardown on EXIT becomes mavlink2rest-first (it depends on the SITL UDP feed), then SITL.

- [ ] **Step 4: Verify the script syntax**

Run: `cd "$HOME/Documents/Claude/Projects/Drone SITL" && bash -n run_sitl.sh`
Expected: exit 0 (syntax valid). No execution — just shell syntax check.

- [ ] **Step 5: Diff sanity check**

Run: `cd "$HOME/Documents/Claude/Projects/Drone SITL" && git diff run_sitl.sh`
Expected: the three additions described above; nothing else (no whitespace churn, no incidental edits to existing logic). Visually verify the existing SITL launch + MAVProxy invocation are byte-identical to before.

- [ ] **Step 6: Commit (in the Drone SITL repo)**

```bash
cd "$HOME/Documents/Claude/Projects/Drone SITL" && git branch --show-current && git add run_sitl.sh && git commit -m "$(cat <<'EOF'
feat: launch mavlink2rest alongside MAVProxy

Adds three things to run_sitl.sh:

1. Pre-launch check that mavlink2rest is on PATH; error out with an
   install hint pointing at the v1.0.2 release page if missing.
2. Background launch of mavlink2rest after SITL TCP 5760 comes up
   but before MAVProxy starts. mavlink2rest consumes UDP 14551
   (the GCS port MAVProxy already routes to) and exposes the REST
   + WebSocket API on 127.0.0.1:8088. Log to /tmp/mavlink2rest.log.
3. Cleanup hook extension to kill the mavlink2rest PID on EXIT,
   teardown before SITL.

The existing SITL launch + MAVProxy invocation are unchanged.
Wiring point for the gcscode SITL listener extension which
subscribes to ws://localhost:8088/v1/ws/mavlink.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify the branch confirmation immediately before commit shows whatever branch the user maintains in this repo (not `master` of gcscode!) — the safety check is "we're in the right repo." Run `pwd` to be doubly sure if uncertain.

---

### Task 6: Roadmap propagation

**Files:**

- Modify: `docs/roadmap.md` (back in the gcscode worktree)

- [ ] **Step 1: Add the SITL listener flip per spec**

Apply the edit per spec section "`docs/roadmap.md` propagation". In `docs/roadmap.md`, find the "Feature extensions → Coming" section, locate the existing unchecked `SITL listener` line, and replace it with the checked version + spec link given in the spec. The exact line content is in the spec.

The "SITL stub" line above it stays unchanged — both lines now show as `[x]`. The Map line, Video feed line, Considering, and Maintenance sections stay unchanged.

- [ ] **Step 2: Format and lint**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm format && pnpm lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && git branch --show-current && git add docs/roadmap.md && git commit -m "$(cat <<'EOF'
docs: roadmap entry for SITL listener

Flip the Feature-extensions "SITL listener" line to checked with
a one-line summary describing the mavlink2rest WebSocket
integration and a link to the spec. SITL stub line above stays
unchanged. Map, Video feed, Considering, and Maintenance
sections unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify branch confirmation reads `feat/extension-sitl-listener`.

---

### Task 7: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check + test + lint suite**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm check && pnpm test && pnpm lint`
Expected: all clean. Workspace test count: 135 (109 shell + 3 example + 23 sitl). The SITL breakdown is 6 index + 9 telemetry-store + 8 mavlink-client.

- [ ] **Step 2: Production build smoke test**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && pnpm --filter @gcscode/shell build`
Expected: build succeeds. Bundle size delta is small — a few hundred bytes for the new modules + view changes.

- [ ] **Step 3: Manual integration smoke test (optional)**

Per spec section "Verification → `pnpm dev` smoke test". This step requires a running ArduCopter SITL + MAVProxy + mavlink2rest. If the user is not currently running that stack, skip this step — the test suite covers the substantive code paths.

If running:

1. In the `Drone SITL` repo: `./run_sitl.sh`. Verify SITL + MAVProxy + mavlink2rest all come up. Verify `curl http://localhost:8088/v1/info` returns a JSON document.
2. In the gcscode worktree: `pnpm dev`. Open `http://localhost:5173/`.
3. SITL Telemetry view shows `connecting` briefly, then `connected`. Mode populates with whatever ArduCopter boots into. Lat/Lng/Alt populate. Heading populates.
4. In MAVProxy: `mode GUIDED`. View's mode field updates to `GUIDED` within ~1 sec.
5. Press `Alt+Shift+L`. Console logs `{ lat, lng, alt }`.
6. Stop `mavlink2rest` manually (or `Ctrl-C` on `run_sitl.sh`). View transitions to `disconnected`.
7. Stop `pnpm dev`.

If the bridge stack is not running: the view shows `Disconnected` immediately on page load (WebSocket constructor synchronously fails). No crash; the rest of the app works. This is the expected fallback behavior.

- [ ] **Step 4: Confirm clean tree and feature commits**

Run: `cd /Users/kevinkroon/Projects/gcscode/.worktrees/extension-sitl-listener/shell && git status && git log --oneline master..HEAD`
Expected: `nothing to commit, working tree clean`. Branch contains 4 new commits beyond master (Tasks 2, 3, 4, 6 — Task 5 lands in a different repo). Plus any `Code-review-followup:` commits.

The `Drone SITL` repo's `run_sitl.sh` commit (Task 5) is independent and lives there; it does not appear in the gcscode `git log master..HEAD`.

---

## Out of scope reminders

These are intentionally NOT part of this iteration (see the spec):

- **Auto-reconnect / retry on disconnect.** Connect on activate, close on deactivate; mid-session drops require a reload.
- **Status bar item.**
- **Map view contribution kind.**
- **Attitude (R/P/Y), groundspeed, throttle, battery.** Single-iteration deferral.
- **Sending commands TO the vehicle.** Listener-only.
- **Multi-vehicle.**
- **WebSocket auth / TLS.**
- **Bundling `mavlink2rest` in our repo.** Developer prerequisite, not a deliverable.
- **Changes to `@gcscode/extension-api`, `@gcscode/extension-example`, registry, manager, persistence, manifest, app.svelte, main.ts, dispatcher, ADRs.**
- **Tests that boot a real bridge or real SITL.** Test suite uses `WebSocket` mocks; integration smoke test is manual (Task 7 Step 3).
- **Cross-repo organizational decision.** Where the bridge launcher lives long-term — captured as a follow-up; not decided this iteration.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note on `.svelte.ts` files

The telemetry store uses the Svelte 5 `$state` rune, which requires the `.svelte.ts` extension to compile. Vite's `@sveltejs/vite-plugin-svelte` plugin and `svelte-check` recognize the extension automatically. The `tsconfig.json` glob `src/**/*.ts` covers `*.svelte.ts` because the literal trailing extension is still `.ts`.

If `pnpm check` reports something like "$state can only be used in .svelte files" — the file's extension is wrong; rename to `.svelte.ts`.

If a test imports the store, it imports from `'./telemetry-store.svelte'` (no `.ts` extension in the import — TypeScript convention). Vite's resolver finds the `.svelte.ts` source.

## Cross-cutting note on the `MockWebSocket` test fixture

Both `mavlink-client.test.ts` (Task 3) and `index.test.ts` (Task 4) need to stub `global.WebSocket`. Two options:

- **Duplicate the mock** in each test file. Simpler; small fixture (~30 lines of class definition).
- **Extract to a shared fixture** (e.g. `packages/extension-sitl/src/__fixtures__/mock-websocket.ts`). Requires creating a `__fixtures__/` folder.

For this iteration, **duplicate**. The first test file establishes the pattern; if a third test file needs it, that's the trigger for extraction. (Same posture as `extension-example/src/__fixtures__/` — present but not over-extracted.)

## Cross-cutting note on the singleton store across tests

`telemetry-store.svelte.ts` is a module-level singleton. Multiple test files in the same Vitest run share the singleton via module imports — Vitest does not isolate module state across test files unless the user opts in.

Tests that mutate the store MUST `reset()` in `beforeEach`. Tests that activate `sitlExtension` MUST also `await sitlExtension.deactivate?.()` in `afterEach` (or `beforeEach` of the next test) because the extension keeps a module-level `client` reference inside `index.ts`.

If tests start interfering across runs (e.g. one test's `applyMessage` leaks state into the next), the symptom is order-dependent test failures. The fix is more aggressive `beforeEach`/`afterEach` cleanup.

## Cross-cutting note on cross-repo task discipline

Task 5 operates in the `~/Documents/Claude/Projects/Drone SITL` repo, NOT the gcscode worktree. The path contains a space; quote it consistently (`"$HOME/Documents/Claude/Projects/Drone SITL"`).

Per CLAUDE.md "Subagent worktree discipline": prepend `cd "$HOME/Documents/Claude/Projects/Drone SITL" &&` to every bash command in Task 5. Verify with `pwd` and `git rev-parse --show-toplevel` before any `git commit` — the latter must end in `Drone SITL`, not `gcscode`.

If the cross-repo edit is delegated to the human (recommended option for token efficiency on small mechanical edits per the conversation precedent), the controller agent can hand a short instruction set instead of dispatching a subagent. The plan's Task 5 step descriptions translate into a ~15-line manual checklist for the user.
