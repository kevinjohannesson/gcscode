# One publisher per camera stream — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `pnpm dev:sitl`, only the launcher's own headless camera-sim page publishes `drone-1`. A camera-sim tab opened before or during a run can no longer take the stream. The tab says the stream is taken, and the launcher counts only its own page as camera-sim being up.

**Architecture:**

- **MediaMTX keeps each path with its first publisher** (`overridePublisher: false`).
- **The page `run.sh` opens is marked** with `?publisher=headless`, which camera-sim adds to its WHIP addresses. The launcher reads that marker back from MediaMTX's session list.
- **A page that MediaMTX refuses says the stream is taken and stops publishing it.**
- **A page that reconnects first ends its old session,** so the refusal never hits its own reconnect.

**Tech stack:** TypeScript and vitest (camera-sim); Node built-ins and `node:test` (the launcher); MediaMTX v1.21.3's config and API; bash 3.2 (`run.sh`).

**Spec:** none of its own. This is the follow-up that [PR #54's plan](2026-11-11-camera-sim-launcher.md) deferred under "Not in this PR", and the owner asked for it once #54 merged. The launcher's design is [`docs/specs/2026-11-10-dev-stack.md`](../specs/2026-11-10-dev-stack.md) § The launcher. Read PR #54's plan first: this one changes its decisions 7 and 9 and its deferral.

## What MediaMTX v1.21.3 does (measured 2026-11-11)

Measured on this Mac with Chrome 157 and MediaMTX v1.21.3, run on spare ports. A small WHIP page published a canvas from headless Chrome. These facts drive every decision below.

1. **The marker round-trips.** A WHIP POST to `…/drone-1/whip?publisher=headless` creates a session whose entry in `GET /v3/webrtcsessions/list` has `"query": "publisher=headless"`, `"state": "publish"` and `"path": "drone-1"`. The path's entry in `GET /v3/paths/list` names it as `"source": {"type": "webRTCSession", "id": "<the session's id>"}`. Neither list logs anything. `GET /v3/webrtcsessions/get/<id>` logs `ERR [API] session not found` for an id that is gone.
2. **`overridePublisher: false` refuses late, not at the WHIP POST.** A second publisher's POST is answered `201`, and its peer connection comes up. MediaMTX then logs `closed: someone is already publishing to path 'drone-1'` and closes the session. The first publisher is undisturbed.
3. **The refused page sees its DTLS transport close about 20 ms after it connects.** `RTCRtpSender.transport.state` becomes `closed`, while `connectionState` stays `connected` for about 5 s more before it goes `disconnected`. Today's page would then retry and be refused again: a cycle of about 6 s, showing `publishing` most of the time, with three MediaMTX log lines per cycle. It never takes the stream.
4. **`pathDefaults: overridePublisher: false` reaches `all_others`.** `GET /v3/config/paths/get/all_others` shows `"overridePublisher": false`, and a second publisher is refused as in fact 2.
5. **A silent publisher's session lingers for 31 s.** With the publishing Chrome frozen (SIGSTOP on its PIDs), MediaMTX logged `closed: peer connection closed` 31.1 s later, and only then freed the path. This is the worst case a reconnect could meet under `overridePublisher: false`.
6. **The reconnects measured lost nothing to the refusal:**
   - **A page reload,** with the unload DELETE or without it. Chrome closes the peer connection on unload, MediaMTX logs `closed: peer connection closed` at once, and the reloaded page publishes.
   - **Chrome's network-service process frozen for 15 s** while the page ran on. The page saw `disconnected` after 5 s and closed its peer. On resume, that close reached MediaMTX before the page's new offer, and the new session published in the same second.
   - **The whole Chrome frozen for 10 s or 20 s.** The session survived: both sides' timers stopped together, and ICE resumed.
   - **The whole Chrome frozen past 31 s.** MediaMTX dropped the session at 31 s. On resume the page saw `failed`, and it published again 1.1 s later.
   - **DELETE, then an immediate POST:** accepted. The DELETE frees the path before it answers.

## Global constraints

- **Never kill by name or pattern.** Tests signal only the PIDs or groups they started; hand checks the same.
- **Tests never use the stack's fixed ports**: TCP 5173, 5174, 5760, 8088, 8554, 8889 and 9997, and UDP 8000, 8001, 8189, 14550 and 14551. The one exception, 99999 in `run.test.ts`, stays as it is.
- **bash 3.2** for `run.sh`.
- **Every new test is seen failing before it passes.** Each task's report lists the mutations it ran and any that survived (`CLAUDE.md` § Tests). Expected values are literals from this plan, never computed by the code under test.
- **Worktree discipline.**
  - Prefix every command with `cd <worktree> &&`.
  - Run `git branch --show-current` before every commit; if it says `master`, stop.
  - Run `pnpm format`, `pnpm test`, `pnpm check` and `pnpm lint` only with that prefix.
- **Public repo.** Commits, docs and PR text use repo-relative paths, no home paths.

## Decisions this plan adds

1. **MediaMTX keeps each path with its first publisher:** `pathDefaults:` with `overridePublisher: false` in `tools/mediamtx/mediamtx.yml`. It goes in `pathDefaults`, not under `all_others`, so a named path added later keeps the rule (fact 4).
2. **The marker is a page setting, `publisher`.** `?publisher=<label>` on the page URL makes camera-sim add `?publisher=<label>` (URL-encoded) to every WHIP address it publishes to. An empty value counts as absent. `run.sh` opens `http://localhost:<port>/?publisher=headless`. The label is fixed, not a fresh token per launch: the strays this fixes are tabs opened at `http://localhost:5174/`, and a per-launch token would need the launcher to pass it to `run.sh`, which the launcher's table does not do.
3. **A refused page stops publishing that stream and says it is taken.** The signal is fact 3: MediaMTX closes the session (its DTLS transport goes `closed` without this page closing it) less than `REFUSAL_WINDOW_MS = 3000` after `connectionState` became `connected`. MediaMTX decides on a publisher once its tracks arrive, within its 2 s `webrtcTrackGatherTimeout` of the connection. The new publisher state is `taken`, with the detail `another publisher already has this stream`. Its WHIP line reads `WHIP taken (another publisher already has this stream)`. The page does not retry, so it can never land in a gap of the real publisher's reconnect, and MediaMTX logs one refusal, not one every 6 s. Reloading the page tries again.
   - **A later close** (a kick through the API, MediaMTX stopping), or one before the connection came up, is not a refusal. The page retries as today, with the detail `MediaMTX closed the session`.
   - **A browser without `RTCRtpSender.transport`** cannot see the close. It keeps today's 6 s cycle, which never takes the stream either (fact 3).
4. **A publisher ends its old session before it publishes again.**
   - **On a retry,** the publisher closes its peer but keeps the old session's address. The next attempt DELETEs that address right before its POST, and posts only once the DELETE has an answer, `ok` or `404`. Any other status, or a network error, fails the attempt, which retries.
   - **So a refusal never comes from the page's own old session,** even when its close was lost on the way. Fact 6 found no reconnect that needed this, but a remote camera-sim on a lossy network would. A refusal there would stop the page for good under decision 3.
   - **Keeping the old session until the new offer is ready** also keeps the path the page's own during the retry delay.
   - **`stop()`** (the page's unload) still DELETEs at once, the current session and any old one it still holds, now with `keepalive: true` so the request outlives the page.
5. **Camera-sim is up when `drone-1`'s publisher is the marked page.** Each poll:
   1. `GET /v3/paths/list`: `drone-1` must be listed with `ready: true`;
   2. its `source` must be a `webRTCSession`;
   3. `GET /v3/webrtcsessions/list`: the session with that `id` must have a `query` whose `publisher` parameter is `headless`.

   Any other publisher fails the launch at once with this message:

   `drone-1 is already being published by something other than camera-sim's headless page, most likely a camera-sim tab left open. Close it, then run pnpm dev:sitl again.`

   MediaMTX refuses the headless page whenever it arrives, and a refused page stops (decision 3), so waiting cannot help. Stopping the launch matches the owner's rule for a port in use. The rest is treated as not up yet, not as a failure:
   - the path not listed or not ready;
   - the session missing from the list, closed between the two requests;
   - an API error, an error status or a non-JSON body.

6. **A service's `up()` can now report a failure.** It resolves to a truthy value (up), a falsy value (not yet), or `{ failure: string }`. A failure fails the service at once with that message, as an exit during startup does, so the stack stops and shows the service's last lines. That line appears among camera-sim's last lines only if the headless page was refused before the launcher saw the other publisher: `page: drone-1 WHIP taken (another publisher already has this stream)`. When the other publisher is first, the launcher usually fails before the page loads. A throw still counts as not up yet.
7. **Kept from PR #54:** camera-sim has no address in the "ready to fly" list (its decision 9). Opening the page is harmless now, but listing its status page is a separate change (below, "Not in this PR").

## Review focus

Inputs no task names but this change meets, each pinned by a test in the task named:

1. **Video panel readers are WebRTC sessions too.** The session list holds the Video panel's reader sessions beside the publisher, so the launcher must match the path's source by `id`, not take the first session (Task 2).
2. **A refusal right at the window's edge.** A close at 2999 ms is `taken`, and one at 3000 ms retries (Task 1).
3. **The page's own close fires no false refusal.** After `stop()`, a `closed` transport event changes nothing (Task 1).
4. **The marker among other query parameters.** `user=x&publisher=headless` still counts (Task 2).
5. **A source session missing from the list,** closed between the two requests, is not up yet, not a failure (Task 2).

## File structure

- `tools/camera-sim/src/output/whip-publisher.ts` and its test: `taken`, the refusal window, ending the old session first, `keepalive` on stop.
- `tools/camera-sim/src/config.ts` and its test: `publisher`, and `whipEndpoint`'s third parameter.
- `tools/camera-sim/src/main.ts`: passes `config.publisher` to `whipEndpoint`.
- `tools/camera-sim/run.sh` and `run.test.ts`: the marked page URL.
- `tools/camera-sim/README.md`.
- `scripts/dev-stack.mjs` and its test: `{ failure }` from `up()`, `cameraSimUp()`, the entry.
- `tools/mediamtx/mediamtx.yml` and `tools/mediamtx/README.md`.
- Docs: PR #54's plan and `docs/roadmap.md`.

### Task 1: the page publishes once, and says when it is taken (`tools/camera-sim`)

**Files:** everything under `tools/camera-sim/` above.

**Interfaces:**

- Produces:
  - in `whip-publisher.ts`:
    - `PublisherState` adds `'taken'`;
    - `export const REFUSAL_WINDOW_MS = 3000`;
    - `PeerConnectionLike` adds `getSenders(): readonly { readonly transport: DtlsTransportLike | null }[]`;
    - `export interface DtlsTransportLike { readonly state: RTCDtlsTransportState; addEventListener(type: 'statechange', listener: () => void): void; removeEventListener(type: 'statechange', listener: () => void): void }`.
  - In `config.ts`:
    - `SimConfig.publisher: string | undefined`;
    - `whipEndpoint(mediaUrl: string, systemId: number, publisher?: string): string`.
  - `run.sh` opens `http://localhost:${PORT}/?publisher=headless`.
  - The page logs `drone-1 WHIP taken (another publisher already has this stream)  <whip url>` when MediaMTX refuses it.

- [ ] **Step 1: Write the failing publisher tests** in `whip-publisher.test.ts`.
  - **The fakes:**
    - `FakePeer.getSenders()` returns one sender whose `transport` is a fake DTLS transport, with `state` and `statechange` listeners;
    - a helper sets the transport `closed` and fires `statechange`;
    - `Call` records `keepalive` from the request init;
    - the fake fetch can be told how each DELETE answers: status 200 by default, 404, 500, or a rejection.
  - **The tests:**
    - `it stops as taken when MediaMTX closes the session right after it connects`:
      1. start, run the timers, `connect('connected')`, then advance 20 ms;
      2. close the transport;
      3. expect `states` to be `['connecting', 'publishing', 'taken']` and `lastError` to be `'another publisher already has this stream'`;
      4. expect the peer closed;
      5. advance 60 000 ms: still one peer and one POST.
    - `it counts a close at 2999 ms as taken`, and `it retries after a close at 3000 ms`. The second expects `retrying` with `lastError` `'MediaMTX closed the session'`, then a second peer 1000 ms later.
    - `it ignores its own close`: after `stop()`, closing the transport leaves `states` ending in `'stopped'`.
    - `it ends the previous session right before publishing again`:
      1. connect, then fail the connection with `connect('failed')`;
      2. no DELETE yet: the calls are the first POST only;
      3. after 1010 ms, the methods in order are `POST`, `DELETE`, `POST`, and the DELETE's URL is `http://media:8889/drone-1/whip/abc`.
    - `it does not publish while the previous session cannot be ended`: the DELETE rejects with `new TypeError('Failed to fetch')`.
      1. The second attempt makes no POST, and the publisher is `retrying` with `lastError` `'Failed to fetch'`.
      2. Once the DELETE answers 200, the third attempt DELETEs, then POSTs.
    - `it takes a 404 for the previous session as already ended`: the DELETE answers 404, and the POST follows.
    - `it retries when ending the previous session answers an error`: the DELETE answers 500 `Internal Server Error`. The publisher is `retrying` with `lastError` `'Could not end the previous WHIP session: 500 Internal Server Error'`, and makes no POST.
    - Extend `stops for good…`: its DELETE has `keepalive: true`.
    - `it ends a session it still holds when stopped during the retry delay`: connect, `connect('failed')`, then `stop()` within the 1000 ms delay. One DELETE of `http://media:8889/drone-1/whip/abc` with `keepalive: true`, and no later POST.

- [ ] **Step 2: Write the failing config and run.sh tests.**
  - **`config.test.ts`:**
    - `readConfig('').publisher` is `undefined`;
    - `readConfig('?publisher=headless').publisher` is `'headless'`;
    - `readConfig('?publisher=').publisher` is `undefined`;
    - `whipEndpoint('http://localhost:8889', 1, 'headless')` is `'http://localhost:8889/drone-1/whip?publisher=headless'`;
    - `whipEndpoint('http://localhost:8889', 1, 'a b&c')` is `'http://localhost:8889/drone-1/whip?publisher=a%20b%26c'`.
  - **`run.test.ts`:** the first test expects Chrome's last argument to be `http://localhost:<port>/?publisher=headless`.
- [ ] **Step 3: Run them and watch each fail for the right reason:** `cd <worktree> && pnpm --filter camera-sim test`.
- [ ] **Step 4: Implement.**
  - **The publisher**, per decisions 3 and 4. Read the transport after `setRemoteDescription`, as `peer.getSenders()[0]?.transport ?? null`. A null transport means no refusal check.
  - **On `taken`:**
    - set `_running` to false, so `start()` can try again;
    - close the peer;
    - keep the session's address for the next attempt's DELETE;
    - schedule nothing.
  - **The guard for the publisher's own close** is the existing `attempt` check: `_retry()` and `stop()` bump `_attempt` before they close the peer.
  - **`readConfig`** reads `publisher`.
  - **`main.ts`** passes `config.publisher` to `whipEndpoint`.
  - **`run.sh`** opens the marked URL.
  - **The file's header comment** says a publisher ends its old session before it posts again, and stops when MediaMTX refuses it.
- [ ] **Step 5: Run `pnpm --filter camera-sim test` and `pnpm --filter camera-sim check`;** both pass. Then mutate each branch, watch the named test fail, and restore:
  - the window's comparison, both off by one and inverted;
  - the transport's `closed` check;
  - the attempt guard on the transport listener;
  - no-retry on `taken`;
  - the DELETE before the POST;
  - the `ok || 404` test;
  - `keepalive`;
  - `readConfig`'s empty check;
  - `whipEndpoint`'s encoding;
  - the URL in `run.sh`.
- [ ] **Step 6: Update `tools/camera-sim/README.md`.**
  - **Step 4 of "Running it":** replace "Never open the page while a headless camera-sim runs…" with: opening the page while a headless camera-sim runs is safe, and shows the status page and the ground check. MediaMTX keeps each stream with its first publisher, so the tab's WHIP line says `taken`.
  - **Settings:** add `publisher`. It has no default. It is a label camera-sim adds to every WHIP address as `?publisher=<label>`. `pnpm --filter camera-sim start` sets `headless`, which is how `pnpm dev:sitl` tells its own page from a tab.
  - **Known limits:** replace "One camera-sim page at a time" with **A stream keeps its first publisher**:
    - MediaMTX refuses a second page publishing the same `drone-<sysid>`. That page's WHIP line says `taken`, and it stops publishing that stream. To publish from it, close the other page, then reload this one.
    - A page reloaded at a moment when its old session cannot be ended (the network cut just then) finds the stream taken by that session. MediaMTX drops it after about 30 s; reload again after that.
- [ ] **Step 7: `pnpm format`, `pnpm lint`, commit:** `feat(camera-sim): keep a stream with its first publisher, and mark the headless page`.

### Task 2: the launcher counts only its own page, and MediaMTX keeps the first publisher (`scripts/dev-stack.mjs`, `tools/mediamtx`)

**Files:**

- `scripts/dev-stack.mjs` and `scripts/dev-stack.test.mjs`;
- `tools/mediamtx/mediamtx.yml` and `tools/mediamtx/README.md`.

**Interfaces:**

- Consumes the marker `publisher=headless` (Task 1).
- Produces:
  - `Service.up`: `() => Promise<boolean | { failure: string }>`. `{ failure }` fails the service; otherwise a truthy value means up and a falsy one not yet;
  - `export async function cameraSimUp(baseUrl)`, resolving to `boolean | { failure: string }` and never throwing;
  - the camera-sim entry's `up`, `() => cameraSimUp(MEDIAMTX_API)`.
  - `streamReady` is removed. Camera-sim was its only user.

- [ ] **Step 1: Write the failing tests** in `scripts/dev-stack.test.mjs`.
  - **The `{ failure }` test:** `an up() that reports a failure fails the launch with its message`. Run two services:
    - `taken`, with `stub: { stdout: 'page: drone-1 WHIP taken\n' }` and `up: "() => ready('taken') ? { failure: 'drone-1 is taken.' } : false"`;
    - `other`, a plain service.

    Expect:
    - exit code 1;
    - stdout has `==> drone-1 is taken.\n`;
    - no `taken is up` and no `All up`;
    - `==> Last lines from taken:\n    page: drone-1 WHIP taken\n` after `==> Stopped.\n`;
    - no survivors.

  - **`serve()` takes routes:** a body per path, so one stub can serve `/v3/paths/list` and `/v3/webrtcsessions/list`. The `hasHeartbeat` and `fetchMessage` tests keep passing one body.
  - **The `cameraSimUp` fixtures:**
    - the path: `{ name: 'drone-1', ready: true, source: { type: 'webRTCSession', id: 's1' }, tracks: ['H264'] }`;
    - the sessions: a reader first, `{ id: 'r1', state: 'read', path: 'drone-1', query: '' }`, then the publisher, `{ id: 's1', state: 'publish', path: 'drone-1', query: 'publisher=headless' }`.

    The message under test is decision 5's, written out in the test as a literal.

  - **The `cameraSimUp` tests:**
    - `cameraSimUp is true when the marked page publishes drone-1`: the result is `true`, and the paths requested were `/v3/paths/list` and `/v3/webrtcsessions/list`;
    - `cameraSimUp finds the marker among other query parameters`: the query is `user=x&publisher=headless`, and the result is `true`;
    - `cameraSimUp fails when an unmarked page publishes drone-1`: the query is `''`, and the result is `{ failure: <the message> }`;
    - `cameraSimUp fails for another label`: the query is `publisher=tab`;
    - `cameraSimUp fails for a publisher that is not a WebRTC session`: the source is `{ type: 'rtspSession', id: 'x' }`;
    - `cameraSimUp is false while the source session is not listed`: the sessions are the reader only;
    - `cameraSimUp is false` for each of:
      - a path listed but not ready;
      - only `drone-2` ready;
      - an empty list;
      - a body that is not JSON;
      - a 500 with a JSON body listing `drone-1` ready;
      - nothing listening.

      These carry over from `streamReady`'s tests.

  - **The config test:** `MediaMTX's config keeps each path with its first publisher`. `tools/mediamtx/mediamtx.yml` has the line `pathDefaults:`, followed directly by the line `  overridePublisher: false`.

- [ ] **Step 2: Run them and watch each fail for the right reason:** `cd <worktree> && node --test scripts/dev-stack.test.mjs`.
- [ ] **Step 3: Implement.**
  - **`waitUntilUp`** handles `{ failure }` before truthiness: it clears the deadline and calls `fail(r, failure)`.
  - **`cameraSimUp`** per decision 5, with the message as a module constant. It follows `fetchMessage`:
    - a `PROBE_MS * 2` timeout per request;
    - `response.ok` required;
    - any error means `false`.
  - **The entry's comment** says up means `drone-1` published by the page `run.sh` marked, and that another publisher fails the launch.
  - **`Service.up`'s typedef** describes the three outcomes.
  - **`mediamtx.yml`:** add `pathDefaults:` with `overridePublisher: false`. Its comment gains: a path keeps its first publisher, so a camera-sim tab cannot take a stream the headless page publishes.
  - **`tools/mediamtx/README.md`:** after "turns off the servers nothing uses", say the config changes defaults: a path keeps its first publisher, so a second publisher of `drone-1` is refused instead of taking it over, and MediaMTX drops a publisher gone silent after about 30 s, which frees its path.
- [ ] **Step 4: Run `pnpm test:scripts`; it passes.** Mutate each branch, watch the named test fail, and restore:
  - the `{ failure }` branch;
  - the ready check;
  - the source-type check;
  - the match by `id`;
  - the marker's parameter name and value;
  - the session-missing branch;
  - the `ok` check;
  - the catch;
  - the yml lines.
- [ ] **Step 5: `pnpm format`, `pnpm lint`, commit:** `feat(dev-stack): count only the headless page as camera-sim, and keep drone-1 with its first publisher`.

### Task 3: the records

**Files:** `docs/plans/2026-11-11-camera-sim-launcher.md`, `docs/roadmap.md`, and this plan.

- [ ] **Step 1: PR #54's plan.**
  - **"Not in this PR":** its entry "Another camera-sim page publishing `drone-1`" keeps its text. It gains a first sub-item: _Fixed in PR #<n>_, linking this plan, with one line on how. The owner asked for the fix after #54 merged, which fired the trigger.
  - **Its Vite-banner deferral** gains one line: since PR #<n>, a page opened from that line is refused and does no harm.
  - **Decision 7** gains one line: since PR #<n>, only the marked page counts as up (this plan, decision 5).
- [ ] **Step 2: The roadmap.**
  - **Camera sim, after v0:** drop the sentences about the page left open, `overridePublisher` and that trigger.
  - **Add a shipped entry** after "Camera sim headless, in the dev stack": **One publisher per camera stream**, shipped 2026-11-11 (PR #<n>), linking this plan. In one or two sentences: MediaMTX keeps each stream with its first publisher, so a camera-sim tab opened during `pnpm dev:sitl` is refused and says so. A tab that got there first stops the launch with a message.
- [ ] **Step 3: `pnpm lint:docs`, `pnpm lint`, commit:** `docs: one publisher per camera stream`.

### Verification by hand (controller, after Task 3)

These need the stack's ports, which were free when this plan was written. If anything holds them, ask the controller session; never stop the owner's processes. Record each result in the PR body under "Verified by hand".

- [ ] **H1, clean cold start.** Run `pnpm dev:sitl` and record the seconds to `camera-sim is up` and to "ready to fly". `GET /v3/webrtcsessions/list` shows one `publish` session for `drone-1`, with `query` `publisher=headless`. The Video panel at http://localhost:5173/ plays: `getVideoPlaybackQuality()`'s decoded frames rise.
- [ ] **H2, a stray page open before launch.**
  1. Before launch, open a second camera-sim page that is not the stack's. Serve it with `pnpm --filter camera-sim exec vite --port 5180`, which is not a stack port, and open it in a headless Chrome on a throwaway profile, or in a tab.
  2. Launch. Expect the stray to win: it is loaded and waiting while the stack starts.
  3. Expect the decision-5 message and exit 1, with no flapping (MediaMTX logs one refusal), and nothing left behind.
  4. If the headless page wins instead, record that, check that the stray says `taken` and stops, and run again until the stray wins.
- [ ] **H3, a stray page opened after camera-sim is up.** Open http://localhost:5174/ in the browser pane.
  - Its status page says `WHIP taken (another publisher already has this stream)`.
  - The session list still shows only the marked publisher.
  - MediaMTX logs one refusal, not one every few seconds.
  - The Video panel keeps decoding.
- [ ] **H4, reconnects, timed.**
  1. SIGSTOP the headless Chrome's network-service process for 15 s, by its PID: it is among the descendants of `run.sh`'s Chrome. Record when the Video panel stops and restarts decoding, and the session ids before and after.
  2. Then SIGSTOP the whole headless Chrome tree for 40 s, by PID. Record when MediaMTX drops the session (expected about 31 s) and how long after SIGCONT the stream is back.
  3. Any refusal of the page's own reconnect is a failure of this plan.
- [ ] **H5, one Ctrl-C.** It leaves no process of the recorded groups, no profile folder and no table port held.

## Checklist: findings left for implementation

The final cross-cutting review verifies each item.

- [ ] **PR #54's deferral "Another camera-sim page publishing `drone-1`"** is resolved: the stream keeps its first publisher (Task 2, H2, H3), the launcher counts only its own page (Task 2, H1), and the deferral and roadmap entries say so (Task 3).
- [ ] **The reconnect risk** of `overridePublisher: false` is measured (facts 5 and 6, H4) and closed by decision 4 (Task 1).
- [ ] **PR #54's untested `up`** ("the camera-sim entry's `up` … A test would need port 9997 or a seam"): `cameraSimUp` takes the base URL and is tested (Task 2).

## Not in this PR

Each item with why, and what brings it back.

- **Camera-sim's status page in the "ready to fly" list.** Opening it is harmless now (decision 7). Revisit when someone wants the link there.
- **A close for another reason within 3 s of connecting reads as `taken`.** For example, MediaMTX stopping just then. The page then stops until reloaded. Under the launcher MediaMTX stops only with the whole stack. Revisit when a page says `taken` with no other publisher.
- **A tab opened with `?publisher=headless` by hand counts as the launcher's page.** Revisit if anyone does that other than on purpose.
- **A MediaMTX upgrade may move the refusal into the WHIP answer.** It would then reach the page as an HTTP error status, which it retries with backoff, not as `taken`. Revisit when `tools/mediamtx/setup.sh`'s pinned version changes; facts 1–5 are the probes to repeat.
- **`drone-1` lost after "All up" still goes unnoticed** (PR #54's deferral, unchanged).
- **Ending the old session has no timeout** (PR #55 DM-1). A DELETE that hangs leaves the publisher in `connecting`, and it never retries. A hung POST does the same today. Revisit when a page stays in `connecting`.
- **`waitUntilUp` takes any truthy object as a failure** (PR #55 DM-5), so `{}` would fail a service with the message `undefined`. Only `cameraSimUp` returns objects, and the typedef states the contract. Revisit when a second service's `up()` returns an object.
- **Untested** (PR #55 DM-2, DM-7):
  - The null-transport path (DM-2), where the publisher makes no refusal check. Revisit when camera-sim runs in a browser without `RTCRtpSender.transport`.
  - A 500 on the paths request (DM-7). It shares `getJson` with the sessions request, and the sessions-500 test covers that.
