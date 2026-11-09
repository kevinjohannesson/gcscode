# Video feed v0 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Video" panel, in a new `extension-video` package, that plays the live stream at the WHEP address in the setting `gcscode.video.whepUrl` and says in operator words why whenever there is no picture.

**Architecture:** One WHEP session module turns an address into a `MediaStream` plus transport-neutral reports; a Svelte 5 state class turns those reports into what the operator sees, with the connect timeout and the retry; a bare component renders the state and owns the session's lifetime. The shell gains one bundled entry and nothing else.

**Tech stack:** TypeScript, Svelte 5 runes, WebRTC (`RTCPeerConnection`, `getStats()`), `fetch`, Vitest with fake timers, `@testing-library/svelte` on jsdom.

**Spec:** [`docs/specs/2026-11-09-video-feed.md`](../specs/2026-11-09-video-feed.md). Read it first; this plan argues from it and does not repeat its reasons.

## Global constraints

- Package `packages/extension-video`, name `@gcscode/extension-video`, export `videoExtension`. Manifest id `gcscode.video`, displayName `Video`, version `0.0.0`.
- View id `gcscode.video.main`, title `Video`. Setting `gcscode.video.whepUrl`, schema `{ type: 'string', format: 'uri' }`, default `http://localhost:8889/drone-1/whep`.
- Timings: connect timeout 15000 ms, retry 3000 ms fixed, `disconnected` grace 5000 ms.
- The package imports runtime only from `@gcscode/extension-api` and `svelte`. It imports no sibling extension (not even types), no `dockview-svelte` or `dockview-core`, and never calls `getDockviewContext()`.
- It never builds, parses or interprets the stream path; `drone-1` appears only inside the default value.
- Nothing in the panel throws, at mount or later: every WebRTC and `fetch` call sits in `try`/`catch` or a promise handler that ends in a panel state.
- Operator text, exactly:
  - Connecting: "Connecting to video…"
  - Unreachable: "Can't reach the video server at `<label>`. Retrying…"
  - No stream: "No video at `<label>` yet. Retrying…"
  - Refused: "The video server refused (`<detail>`). Retrying…"
  - No picture in time: "Connected, but no picture arrived. Retrying…"
  - Lost: "Video lost. Reconnecting…"
  - Unsupported: "This browser can't play this video."
  - `<label>` is the address.
- Shell changes, and nothing else in `packages/shell` or `packages/extension-api`:
  - the `bundled-extensions.ts` entry and Map's entry comment;
  - the `packages/shell/package.json` dependency;
  - `bundled-extensions.test.ts`.
- Every worktree command is prefixed `cd <worktree> &&`. Check `git branch --show-current` before every commit; if it says `master`, stop. Run `pnpm format`, `pnpm test`, `pnpm check` and `pnpm lint` only with that prefix.
- Every new test is seen failing before it passes. Each task's report lists the mutations it ran, and any that survived (`CLAUDE.md` § Tests).

## Decisions this plan adds

The spec leaves these open. Each is my call.

1. **The package tests on jsdom with `svelteTesting()`, not on `node`.** The spec says "in the `node` environment like the other extension packages", but Task 3 mounts the component. `extension-assets-demo` is the precedent: its `vitest.config.ts` explains why `svelteTesting()` is needed for runes. The session and state tests inject their own fakes, so the environment does not change what they prove.
2. **A session never reports during the `openWhepSession` call itself.** Its first report comes after at least one microtask, so the caller always holds the session before any report arrives.
3. **A session sends at most one failure report.** After it, the session reports nothing more.
4. **Unexpected errors map to existing reports.**
   - A peer-connection call that throws before the POST (`addTransceiver`, `createOffer`, `setLocalDescription`) reports "unsupported".
   - A 2xx whose body cannot be read, or whose answer `setRemoteDescription` rejects, reports "refused" with detail `bad answer`.
   - The spec's table adds no kind for either case.
5. **A 2xx that arrives after `close()`** is applied to nothing and reports nothing. The session sends `DELETE` to its `Location`, so a quick disable leaves no reader at MediaMTX.
6. **Picture poll:**
   - `getStats()` runs every 250 ms, starting once the answer is applied.
   - A tick is skipped while the previous call is pending.
   - A rejected `getStats()` is ignored; the panel's connect timeout covers a poll that never succeeds.
7. **Gathering has no cap of its own.** The session waits for `iceGatheringState` to be `complete`, and a gathering that never completes ends at the panel's 15000 ms timeout, which closes the session. A cap would be a third timer the spec does not list.
8. **Only the first attempt shows "Connecting to video…".** A retry keeps the previous failure's text until the next picture or failure, so a server that refuses in milliseconds gives a steady line instead of text that flickers every 3 seconds.
9. **On every failure the state closes the session and clears the stream** before it schedules the retry.
10. **The bundled entry goes directly before `mapExtension`**, after `mapDemoExtension`.
11. **The propagation names the renamed setting.** PR #46 renamed `gcscode.sitl.connectionUrl` to `gcscode.mavlink.connectionUrl` after the spec was written, so the settings-editor text names the new key.

## Review focus

These failure modes are implied by the spec but not in its Validation list. Each is pinned by a test in the task named.

1. **Disabling during the POST.** The answer arrives after `close()`. It must not reach the peer connection, must not report, and must not leave a reader at MediaMTX (Task 1, decision 5).
2. **A malformed answer.** A 201 with an SDP the browser rejects reports "refused (bad answer)": no unhandled rejection, and no silent "Connecting…" until the timeout (Task 1, decision 4).
3. **A server that fails fast.** The operator sees one steady failure line across retries, with no "Connecting…" in between (Task 2, decision 8).
4. **A stale report.** A report from a session the state has already closed or replaced changes nothing (Task 2).
5. **A browser with no WebRTC and no `IntersectionObserver`.** Mounting the panel does not throw and shows the unsupported line. jsdom has neither, so the component test runs exactly this case (Task 3).

---

## File structure

```
packages/extension-video/
  package.json, tsconfig.json, vitest.config.ts, README.md
  src/video-source.ts                  the seam: report types, VideoSession, OpenVideoSession (Task 1)
  src/whep-session.ts                  openWhepSession: WHEP over RTCPeerConnection (Task 1)
  src/test-fakes.ts                    FakePeerConnection, fake track and stream, fetch stubs (Task 1, tests only)
  src/whep-session.test.ts             (Task 1)
  src/video-panel-state.svelte.ts      VideoPanelState: timeout, retry, operator text (Task 2)
  src/video-panel-state.test.ts        (Task 2)
  src/video-address.ts                 module state: the address activate() read (Task 3)
  src/video-panel.svelte               the view component (Task 3)
  src/index.ts                         videoExtension (Task 3)
  src/index.test.ts, src/video-panel.test.ts (Task 3)
packages/shell/package.json, pnpm-lock.yaml                                  (Task 4)
packages/shell/src/extension-host/bundled-extensions.ts, bundled-extensions.test.ts (Task 4)
docs/out-of-scope.md, docs/roadmap.md, docs/vs-code-alignment.md             (Task 5)
```

### Task 1: package scaffold, the seam, and the WHEP session

**Files:**

- Create:
  - `packages/extension-video/package.json`, `tsconfig.json` and `vitest.config.ts`
  - `src/video-source.ts`, `src/whep-session.ts`, `src/test-fakes.ts` and `src/whep-session.test.ts`
- Modify: `pnpm-lock.yaml` (via `pnpm install`)

**Interfaces (produces):**

```ts
// src/video-source.ts — transport-neutral; nothing here names WHEP, SDP or HTTP
export type SessionReport =
  | { kind: 'stream'; stream: MediaStream }
  | { kind: 'picture' }
  | { kind: 'unreachable' | 'no-stream' | 'dropped' | 'unsupported'; label: string }
  | { kind: 'refused'; label: string; detail: string };
export type ReportListener = (report: SessionReport) => void;
export interface VideoSession {
  close(): void;
}
export type OpenVideoSession = (listener: ReportListener) => VideoSession;

// src/whep-session.ts
export interface WhepEnvironment {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  RTCPeerConnection: (new () => RTCPeerConnection) | undefined;
}
export function openWhepSession(
  url: string,
  listener: ReportListener,
  env?: WhepEnvironment,
): VideoSession;
```

When `env` is omitted, it is read from `globalThis` at call time. The label in every failure report is `url`.

- [ ] **Step 1: Scaffold the package.**
  - Copy `packages/extension-vehicle-status`'s `package.json` and `tsconfig.json` with the new name. The only dependency is `@gcscode/extension-api` `workspace:*`; the peer dependency is `svelte` `^5.0.0`.
  - Copy `vitest.config.ts` from `packages/extension-assets-demo` (decision 1), with its comment shortened to say why.
  - Run `pnpm install` and expect the lockfile to gain the `packages/extension-video` importer.
- [ ] **Step 2: Write `src/test-fakes.ts`.**
  - `FakePeerConnection extends EventTarget` records every call (`addTransceiver` arguments, `setRemoteDescription` argument, `getStats` call count, `close` count, and calls made after `close`).
  - `createOffer()` resolves `{ type: 'offer', sdp: 'fake-offer-sdp' }`.
  - `iceGatheringState` is settable, `'complete'` by default; tests fire `icegatheringstatechange`.
  - `setRemoteDescription` dispatches a `track` event carrying a fake track (an `EventTarget` that tests can make fire `ended`) and `streams: [fakeStream]`.
  - `connectionState` is settable; tests dispatch `connectionstatechange`.
  - `getStats()` resolves a `Map` holding one `{ type: 'inbound-rtp', kind: 'video', framesDecoded }` whose count the test sets.
  - A `fetch` stub records `(url, init)` and returns `new Response(body, { status, headers })` per test.
- [ ] **Step 3: Write the failing tests in `src/whep-session.test.ts`.** Use `url = 'http://localhost:8889/drone-1/whep'` and fake timers wherever time passes.
  - _Offer and answer:_
    - The transceiver is `('video', { direction: 'recvonly' })`.
    - With `iceGatheringState` `'gathering'`, no POST happens until `icegatheringstatechange` brings it to `'complete'`.
    - The POST is `fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: 'fake-offer-sdp' })`.
    - The answer is applied as `{ type: 'answer', sdp: <response body> }`.
    - `stream` is reported once, with the fake stream.
  - _Picture:_
    - With `framesDecoded` 0, advancing 1000 ms reports nothing.
    - Set it to 3, advance 250 ms, and expect exactly one `{ kind: 'picture' }`.
    - The `getStats` call count is the same after another 5000 ms.
  - _Failures:_
    - `fetch` rejects: `[{ kind: 'unreachable', label: url }]`.
    - Status 404: `no-stream`.
    - Status 503: `{ kind: 'refused', label: url, detail: '503' }`.
    - `RTCPeerConnection` undefined, or a constructor that throws: `unsupported`. In both cases the listener is empty right after `openWhepSession` returns and holds the report after `await Promise.resolve()` (decision 2).
    - Status 201 whose `setRemoteDescription` rejects: `{ kind: 'refused', label: url, detail: 'bad answer' }` (Review focus 2).
  - _Drops, after the stream:_
    - `connectionState` `'failed'` reports `dropped` at once.
    - The track's `ended` reports `dropped`.
    - `'disconnected'` reports nothing at 4999 ms and `dropped` at 5000 ms.
    - `'disconnected'` then `'connected'` at 3000 ms reports nothing by 10000 ms.
    - `'failed'` followed by `ended` reports `dropped` once (decision 3).
  - _Close:_
    - With `Location: /drone-1/whep/abc`, `close()` sends `fetch('http://localhost:8889/drone-1/whep/abc', { method: 'DELETE' })` and closes the peer connection once.
    - A second `close()` sends no second `DELETE`, and the close count stays 1.
    - Without `Location`, there is no `DELETE` and the peer connection is still closed.
    - A rejected `DELETE` raises no unhandled rejection.
    - `close()` itself reports nothing.
    - After `close()`, `getStats` is not called again (advance 5000 ms).
    - A `'disconnected'` that began before `close()` reports nothing when its 5000 ms run out.
  - _Close before the answer (Review focus 1):_
    - `close()` while the POST is pending closes the peer connection.
    - When the 201 then resolves, `setRemoteDescription` is never called and nothing is reported.
    - `DELETE` goes to that response's `Location`.
- [ ] **Step 4: Run the tests and see them fail.** Run `cd <worktree> && pnpm --filter @gcscode/extension-video test`. They should fail because `openWhepSession` is not defined.
- [ ] **Step 5: Implement `src/video-source.ts`, then `openWhepSession` in `src/whep-session.ts`.**
  - Listen with `addEventListener` (`track`, `connectionstatechange`, `icegatheringstatechange`, and the track's `ended`).
  - Take the stream from `event.streams[0]`, falling back to `new MediaStream([event.track])` inside a `try`.
  - Watch `connectionState` only once the answer is applied.
  - Exported constants are `PICTURE_POLL_MS = 250` and `DISCONNECTED_GRACE_MS = 5000`. Tests use the literal numbers, not the constants.
  - Every promise chain ends in a handler. The function body is wrapped so that a synchronous throw becomes an "unsupported" report.
- [ ] **Step 6: Run the tests and see them pass.** Run the same command, then `cd <worktree> && pnpm check && pnpm lint`.
- [ ] **Step 7: Mutate and restore, and report each outcome.**
  - Report `picture` on every poll.
  - Drop the `closed` guard on the late answer.
  - Make the grace 4999 ms.
  - Skip `clearInterval` in `close()`.
  - Report `dropped` on `closed`.
  - Each should fail a named test.
- [ ] **Step 8: Commit.** `git add packages/extension-video pnpm-lock.yaml`, then `git commit -m "feat(video): the WHEP session behind a transport-neutral seam"`.

### Task 2: the panel state

**Files:**

- Create: `packages/extension-video/src/video-panel-state.svelte.ts` and `src/video-panel-state.test.ts`

**Interfaces:**

- Consumes `SessionReport`, `VideoSession` and `OpenVideoSession` from Task 1.
- Produces:

```ts
export type PanelStatus =
  | 'connecting'
  | 'playing'
  | 'unreachable'
  | 'no-stream'
  | 'refused'
  | 'no-picture'
  | 'lost'
  | 'unsupported';
export class VideoPanelState {
  public constructor(label: string, open: OpenVideoSession);
  public get status(): PanelStatus;
  public get message(): string | null; // null exactly while playing
  public get stream(): MediaStream | null;
  public start(): void; // first attempt; a second call does nothing
  public stop(): void; // closes the session, clears both timers; idempotent
}
```

The class follows `.claude/rules/svelte.md`: `private _x = $state(...)` behind `public get`, and explicit `private`/`public` on every member. Exported constants are `CONNECT_TIMEOUT_MS = 15000` and `RETRY_DELAY_MS = 3000`.

- [ ] **Step 1: Write the failing tests.**
  - Use fake timers, `label = 'http://localhost:8889/drone-1/whep'`, and a fake `open` that records each listener and returns a session whose `close` is a spy.
  - The expected text is the Global constraints' wording, with `<label>` filled in.
  - _Connecting to playing:_
    - After `start()`: status `connecting`, message "Connecting to video…".
    - After a `stream` report: still `connecting`, and `stream` is set.
    - After `picture`: `playing`, message `null`.
  - _Timeout:_
    - With no picture, the status is still `connecting` at 14999 ms and `no-picture` at 15000 ms.
    - The session is closed and `stream` is `null`.
  - _Drops:_ `dropped` before `picture` gives `no-picture`; after it, `lost` ("Video lost. Reconnecting…").
  - _Each failure's text:_
    - `unreachable` and `no-stream` show the label.
    - `refused` with detail `503` shows "The video server refused (503). Retrying…".
  - _Retry:_
    - After any failure but `unsupported`, `open` is called a second time at exactly 3000 ms (not at 2999).
    - After `unsupported`, `open` is called once in 60000 ms and the message is "This browser can't play this video.".
  - _Retry keeps the failure text (Review focus 3):_
    - `unreachable`, then 3000 ms: during the new attempt, `status` and `message` are still the unreachable ones.
    - A `picture` from the new attempt gives `playing`.
  - _Stale report (Review focus 4):_ after a timeout and retry, a `picture` sent through the first attempt's listener leaves `status` unchanged.
  - _Stop:_
    - After `stop()`, `session.close` has been called.
    - `vi.getTimerCount()` is 0.
    - Advancing 60000 ms opens nothing.
    - A second `stop()` closes nothing more.
  - _`open` throws:_ the status is `unsupported` and nothing escapes `start()`.
- [ ] **Step 2: Run them and see them fail.** Run `cd <worktree> && pnpm --filter @gcscode/extension-video test`. They should fail because the module is missing.
- [ ] **Step 3: Implement `VideoPanelState`.** Tag each attempt so that a superseded listener is ignored.
- [ ] **Step 4: Run the tests and see them pass.** Then run `pnpm check && pnpm lint`, with the prefix.
- [ ] **Step 5: Mutate and restore, and report each outcome.**
  - Use 14999 ms.
  - Retry after `unsupported`.
  - Treat a pre-picture drop as `lost`.
  - Reset the text to "Connecting…" on retry.
  - Don't close on failure.
  - Accept stale reports.
- [ ] **Step 6: Commit.** Run `git commit -m "feat(video): panel state with connect timeout, retry and operator text"`.

### Task 3: the view component and the extension

**Files:**

- Create:
  - `packages/extension-video/src/video-address.ts`, `src/video-panel.svelte` and `src/index.ts`
  - `src/index.test.ts`, `src/video-panel.test.ts` and `README.md`

**Interfaces:**

- Consumes `openWhepSession` (Task 1) and `VideoPanelState` (Task 2).
- Produces:

```ts
// src/video-address.ts — not exported from index.ts
export const DEFAULT_WHEP_URL = 'http://localhost:8889/drone-1/whep';
export function setVideoAddress(url: string): void;
export function getVideoAddress(): string; // DEFAULT_WHEP_URL until set

// src/index.ts — the package's only export
export const videoExtension: Extension;
```

`activate(context)` does the following, then returns `undefined`:

1. Registers the setting. The schema adds a `description` in operator terms, and the disposable goes to `subscriptions`.
2. Reads `getConfiguration('gcscode.video').get<string>('whepUrl', DEFAULT_WHEP_URL)` once, and calls `setVideoAddress` with it.
3. Registers the view `{ id: 'gcscode.video.main', component: VideoPanel, title: 'Video' }` and pushes that disposable too.

There is no `deactivate`.

`video-panel.svelte` takes no props, holds no host reference, and does the following:

- Builds `new VideoPanelState(address, (l) => openWhepSession(address, l))` from `getVideoAddress()`.
- Starts it on mount and stops it on destroy.
- Renders one `<video muted autoplay playsinline>`, always in the markup and letterboxed (`object-fit: contain`), shown only while `status === 'playing'`. While not playing, `message` is centred in its place.
- Sets `srcObject` from `state.stream` in an effect.
- Calls `play()` (rejection caught) when an `IntersectionObserver` reports the element intersecting while it is paused with a stream. This is done only when `IntersectionObserver` exists.

Before writing the component, follow `.claude/rules/svelte.md`: the Svelte MCP sections, then `svelte-autofixer` until it is clean.

- [ ] **Step 1: Write the failing tests.**
  - `index.test.ts`, with the fake host from `extension-vehicle-status`'s test:
    - Manifest: `gcscode.video`, `Video`, `0.0.0`.
    - `registerConfiguration` is called with `key` `'gcscode.video.whepUrl'`, `schema.type` `'string'`, `schema.format` `'uri'` and `default` `'http://localhost:8889/drone-1/whep'`.
    - `registerView` is called with id `'gcscode.video.main'`, title `'Video'`, and the component imported from `./video-panel.svelte`.
    - `subscriptions` holds exactly the two returned disposables.
    - `activate` returns `undefined`.
    - With `get` returning `'http://a.test/a/whep'`, then on a second activation `'http://b.test/b/whep'`, `getVideoAddress()` is `'http://b.test/b/whep'`.
  - `video-panel.test.ts` (jsdom has neither `RTCPeerConnection` nor `IntersectionObserver`: Review focus 5):
    - `render(VideoPanel)` does not throw.
    - `await vi.waitFor` finds "This browser can't play this video.".
    - A `video` element is present.
    - Unmounting does not throw.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `video-address.ts`, `video-panel.svelte` and `index.ts`.**
  - Write the README: what the panel shows, the setting and how an operator changes it today (devtools, then reload), and the seam with its rule against throwing.
  - Also cover the rule against building a stream path from a system ID.
- [ ] **Step 4: Run the tests and see them pass.** Then run `pnpm check && pnpm lint`, with the prefix.
- [ ] **Step 5: Mutate and restore, and report each outcome.**
  - Drop the `IntersectionObserver` guard: the component test should throw at mount.
  - Read the setting from a constant.
  - Swap the two `push`es for one.
- [ ] **Step 6: Commit.** Run `git commit -m "feat(video): the Video view and the gcscode.video extension"`.

### Task 4: bundling into the shell

**Files:**

- Modify:
  - `packages/shell/package.json` and `pnpm-lock.yaml`
  - `packages/shell/src/extension-host/bundled-extensions.ts` and `bundled-extensions.test.ts`

**Interfaces:** consumes `videoExtension` (Task 3).

- [ ] **Step 1: Write the failing tests.**
  - Rename the existing test from "…the one position in this list that is a requirement" to `'bundles map before mavlink-flight-overlay, an activation requirement'`.
  - Rewrite its comment so that it lists two requirements: the activation order, and the landing tab pinned by the two tests below.
  - Add:

```ts
it('bundles video before map, so Map is the tab every load opens on', () => {
  const ids = bundledExtensions.map((entry) => entry.id);
  expect(ids.indexOf('gcscode.video')).toBeGreaterThanOrEqual(0);
  expect(ids.indexOf('gcscode.video')).toBeLessThan(ids.indexOf('gcscode.map'));
});

it('keeps map the last entry that registers a view: only mavlink-flight-overlay follows it', () => {
  const ids = bundledExtensions.map((entry) => entry.id);
  expect(ids.slice(ids.indexOf('gcscode.map') + 1)).toEqual(['gcscode.mavlink-flight-overlay']);
});
```

- [ ] **Step 2: Run them and see the first fail.** Run `cd <worktree> && pnpm --filter @gcscode/shell test bundled-extensions`. The first test should fail because `gcscode.video` is missing; the second passes until Step 3 and must stay green through it.
- [ ] **Step 3: Add the dependency and the entry.**
  - Add `"@gcscode/extension-video": "workspace:*"` and run `pnpm install`.
  - Add the `videoExtension` entry directly before `mapExtension` (decision 10). Its comment says that Video sits before Map so that Map stays the front tab at load: panels are added in registration order, the last one added is in front, and layout is not saved. It also says this is not an activation constraint.
  - Extend Map's entry comment: Map must stay the last entry that registers a view, and only the overlay, which registers none, may follow it (PR #45 RT-15).
- [ ] **Step 4: Run the tests and see them pass.** Then run `pnpm test`, `pnpm check` and `pnpm lint`, each with the prefix.
- [ ] **Step 5: Mutate and restore, and report each outcome.**
  - Move the Video entry after Map.
  - Append a copy of the example entry at the end.
  - Each should fail one named test.
- [ ] **Step 6: Check the shell diff is exactly the allowed one (PR #45 RT-17).** Run `git diff origin/master --stat -- packages/shell packages/extension-api`. It should list only `packages/shell/package.json`, `bundled-extensions.ts` and `bundled-extensions.test.ts`.
- [ ] **Step 7: Commit.** Run `git commit -m "feat(shell): bundle the Video extension ahead of Map"`.

### Live verification (controller, after Task 4)

Run this before the final review, and record the results in the PR body under "Live verification".

Setup:

- SITL per `tools/sitl/README.md` with `--streamrate 25`.
- camera-sim from the `.worktrees/camera-sim-v0` checkout (`pnpm --filter camera-sim dev`, a visible window on port 5174).
- MediaMTX, already started by hand.
- `tools/sitl/client/fly_circle.py`.
- `pnpm dev`.

Then:

- [ ] **The demo.** The drone circles on Map, and its video plays in Video, side by side. Record the time from load to the first picture.
- [ ] **Late camera.** Start gcscode before camera-sim. The panel should show "No video at … yet", and play within about 10 s of camera-sim publishing.
- [ ] **Server restart.** Stop MediaMTX mid-flight and record the time to "Video lost". Restart it: the picture returns without a reload.
- [ ] **Map in front at load.** Every load opens on Map, with Video's tab beside it.
- [ ] **A session that starts hidden.**
  - Behind Map at load, Video does not cycle through "no picture in time", and shows the picture when first switched to.
  - The same holds after a MediaMTX restart while Map is in front.
- [ ] **Tab switching.** With Map and Video as tabs in one group, the picture resumes on every switch back.
- [ ] **Clean hang-up.** Disable Video in the extensions panel. Expect:
  - the panel goes;
  - MediaMTX logs the reader closing.

  Re-enable it: the panel returns playing.

### Task 5: propagation (at ship time)

**Files:** modify `docs/out-of-scope.md`, `docs/roadmap.md` and `docs/vs-code-alignment.md`.

- [ ] **Step 1: Merge master into the branch.** Run `git merge origin/master`. Never rebase a reviewed PR branch.
- [ ] **Step 2: Apply the spec's out-of-scope propagation, items 1 to 8, as written there, with two corrections.**
  - Item 1's trigger reads "or a second vehicle whose video an operator needs" (PR #45 RT-9).
  - Item 4 names `gcscode.mavlink.connectionUrl` as the first setting consumer (decision 11).
  - New rows go at the end of "Extension machinery", in the spec's order, except row 8, which sits beside the ADR-0014 rows.
- [ ] **Step 3: Apply the spec's roadmap propagation.** Tick Video feed with its shipped note, and change MediaMTX-in-the-repo's trigger.
- [ ] **Step 4: Apply the spec's ledger propagation.** Every trigger copied from the spec's table uses out-of-scope row 1's wording, not "a stream tied to a vehicle" (PR #45 RT-9).
- [ ] **Step 5: Run `pnpm lint:docs` and `pnpm lint`.** Commit one file per commit, as `docs(out-of-scope): …`, `docs(roadmap): …` and `docs(vs-code-alignment): …`.

## Checklist: spec findings left for implementation

The final cross-cutting review verifies each item.

- [ ] **PR #45 RT-9:** every copy of the contract's trigger reads "a second vehicle whose video an operator needs" (Task 5).
- [ ] **PR #45 RT-15:** a test pins Map as the last entry that registers a view, and Map's entry comment says so (Task 4).
- [ ] **PR #45 RT-16:** that test names `gcscode.mavlink-flight-overlay`, the id since PR #46 (Task 4).
- [ ] **PR #45 RT-17:** the shell diff is exactly the Global constraints' list: the entry, Map's comment, the dependency (with `pnpm-lock.yaml` at the root) and the test with its new assertions (Task 4, Step 6).
- [ ] **Known unknown, the owner's browser:** the PR names the browser and version the live checks ran in, the `IntersectionObserver` resume included. Safari and Firefox stay unverified unless run.
- [ ] **Known unknown, timings against camera-sim:** the PR records the time to first picture and to "Video lost", against 15 s and about 10 s.
- [ ] **Known unknown, gcscode's own tab hidden:** with the demo running, hide gcscode's browser tab for 30 s and show it again. The PR records whether the picture is live at once.
- [ ] **Known unknown, latency:** the PR records camera-sim's burned-in UTC time against a clock, as one rough reading with no target.
- [ ] **Known unknown, H.264:** the PR records that the demo browser decoded camera-sim's H.264.
- [ ] **Repo-state claims re-checked** (spec § Post-merge implementation):
  - the view host passes no props;
  - dockview's default renderer detaches hidden tabs;
  - the panel-sync effect in `app.svelte`;
  - `gcscode.mavlink.connectionUrl` is the only other setting.

  The final review re-checks any claim the implementer did not.
