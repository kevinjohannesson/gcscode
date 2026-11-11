# Camera-sim in the dev stack — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm dev:sitl` also starts camera-sim, headless: its dev server on 5174 and a headless Chrome on the page, so the Video panel plays `drone-1` with no camera-sim window, and one Ctrl-C leaves no Chrome behind.

**Architecture:** camera-sim gets a start script, `tools/camera-sim/run.sh`, that starts its Vite dev server, opens the page in a headless Chrome on a throwaway profile once the server answers, and stops both on a signal or when either exits. The launcher runs that script as one more entry in its service table, in one process group like the others. The entry counts as up once MediaMTX lists `drone-1` as ready, read from MediaMTX's API, which the committed config turns on for loopback.

**Tech stack:** bash 3.2 (macOS's `/bin/bash`), Vite, vitest; Node built-ins and `node:test` for the launcher.

**Spec:** [`docs/specs/2026-11-10-dev-stack.md`](../specs/2026-11-10-dev-stack.md), § Camera-sim's slot, § Known unknowns, and the launcher's design (§ The launcher). Read it first, then the headless test's outcome below. This plan argues from them.

## The headless test (2026-11-10)

It ran outside this PR, against the spec's Known unknown, and passed:

- **WebGL ran on the GPU.** Intel UHD 630 through ANGLE Metal.
- **The camera held 30 fps,** like a visible tab.
- **The WHIP stream held.** gcscode's Video panel played it for 6 minutes.
- **Cost:** about 55% of one core and 500 MB.

It used `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir="$(mktemp -d)" http://localhost:5174/`, nothing else. Its other findings, used below:

- SIGTERM takes Chrome and every helper down within 2 s, and the helpers stay in the spawner's process group.
- The page sends no WHIP `DELETE` on a stop, so `drone-1` lingers in MediaMTX for 30–45 s. In the stack MediaMTX stops with it.
- Start Chrome only once the dev server answers.

## Global constraints

- **One table entry** (spec § Camera-sim's slot): its dev server on 5174 plus a headless Chrome opening the page, one process group, like every other service.
- **Each service's config stays in its own `tools/` folder** (spec decision 6). How camera-sim starts lives in `tools/camera-sim/`, and the launcher only names the script.
- **Never kill by name or pattern.** `run.sh` signals only PIDs it recorded when it started them; the launcher only the groups it recorded at spawn.
- **bash 3.2.** macOS's `/bin/bash` is 3.2.57 and is the only bash on this Mac. It has no `wait -n`, and under `set -u` an empty array's `"${a[@]}"` fails.
- **Tests never use the stack's fixed ports** (5173, 5174, 5760, 8000, 8001, 8088, 8189, 8554, 8889, 9997, 14551). They use ephemeral ports only. Every process a test starts is stopped by its PID or process group in an `after` hook, whether the test passed or not.
- **Every new test is seen failing before it passes.** Each task's report lists the mutations it ran and any that survived (`CLAUDE.md` § Tests).
- **Worktree discipline.**
  - Prefix every command with `cd <worktree> &&`.
  - Run `git branch --show-current` before every commit; if it says `master`, stop.
  - Run `pnpm format`, `pnpm test`, `pnpm check` and `pnpm lint` only with that prefix.
- **Public repo.** Commits, docs and PR text use repo-relative paths, no home paths.

## Decisions this plan adds

The spec leaves these open. _Measured_ facts were checked on this Mac on 2026-11-11 with Chrome 157 and MediaMTX v1.21.3, against a MediaMTX on spare ports.

1. **A start script in camera-sim's folder: `tools/camera-sim/run.sh`,** run as `pnpm --filter camera-sim start` or by the launcher. In order, it:
   1. checks Chrome;
   2. checks the port. If `nc -z localhost "$PORT"` already succeeds, it prints exactly this to stderr and exits 1:

      `ERROR: something already listens on TCP <port> (another camera-sim?). Stop it first, or set CAMERA_SIM_PORT to another port.`

   3. makes the profile;
   4. starts Vite as `pnpm --silent exec vite --port "$PORT" --strictPort`, from its own folder. `--strictPort` covers the race between the port check and Vite's bind;
   5. waits until `nc -z localhost "$PORT"` succeeds;
   6. starts Chrome;
   7. polls `kill -0` on both PIDs every 0.5 s.
   - **Either one exiting by itself** prints `ERROR: <Chrome | camera-sim's dev server> exited (code N).` to stderr. The script then exits 1.
   - **SIGINT, SIGTERM or SIGHUP** make it exit as well.
   - **On every exit,** an `EXIT` trap sends SIGTERM to the PIDs it started, waits for them, and removes the profile.
   - _Measured:_
     - Vite binds `localhost` as `[::1]` only, so 127.0.0.1 never answers, and `nc -z localhost` does.
     - `nc -z localhost` answers for any holder of the port, so the wait cannot tell it from Vite. Vite's `--strictPort` fails only about 1 s later, after Chrome has started. Hence the port check.
     - SIGTERM to `pnpm exec`'s PID stops Vite too.
     - `$!` after `chrome … 2> >(sed …) &` is Chrome's own PID.

2. **Chrome:** `CAMERA_SIM_CHROME`, default `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. When it is not executable, the script prints exactly this and exits 1 before it makes the profile or starts Vite:

   `ERROR: Google Chrome missing: <path>. Install it from https://www.google.com/chrome/, or set CAMERA_SIM_CHROME to a Chrome binary.`

   This follows the setup messages of `tools/mediamtx/run.sh` and `run_sitl.sh`. The launcher repeats no setup checks (spec § Setup not run), so this message, under `camera-sim |`, is what a missing Chrome shows.

3. **Port:** `CAMERA_SIM_PORT`, default 5174. It is for running camera-sim alone beside something else on 5174, and for the tests. The launcher checks 5174 and passes no environment of its own.
4. **Profile:** `mktemp -d "${TMPDIR:-/tmp}/camera-sim-chrome.XXXXXX"`, made fresh on every start and removed on every exit the script handles. A SIGKILL, such as the launcher's after its 5 s grace, leaves it behind in `TMPDIR`, which macOS clears of old files.
5. **Camera-sim's status reaches the launcher's output: page errors and publish state.** This was the PR's open choice.
   - Headless hides the status page. Opening the page to see it starts a second publisher, which takes `drone-1` in turn (README § Known limits). Without this, the output would be the only place left, and a camera-sim that is not up within its deadline would show only Vite's banner as its last lines.
   - Chrome runs with `--enable-logging=stderr --log-level=0`, its stderr through `sed -l`:
     - each `…:CONSOLE…] "<message>", source: …` line prints as `page: <message>`;
     - lines with `:FATAL:` pass as they are;
     - every other Chrome line is dropped.
   - _Measured:_ plain headless Chrome prints nothing, and `--enable-logging=stderr` alone printed nothing. With `--log-level=0` the page's console lines arrive, uncaught errors and rejections among them. So do about 14 lines of Chrome's own noise per run (`CVDisplayLinkCreateWithCGDisplay failed`, mach-port rendezvous errors at exit).
   - The page logs with `console.info`:
     - each telemetry state change, as `Telemetry <state>  <mavlink url>`;
     - the terrain line once, as `Terrain <line>`;
     - each vehicle's WHIP state change, as `drone-<id> WHIP <state>[ (<detail>)]  <whip url>`.

     Vite's own `[vite] connecting...` and `[vite] connected.` pass too; they show the page loaded.

   - Not logged: imagery status and the ground check (deferred below).

6. **`CAMERA_SIM_TERRAIN_DIR` defaults in camera-sim's Vite config, not in the launcher.** The order:
   1. `CAMERA_SIM_TERRAIN_DIR` from the environment, then from `.env.local`. Vite's `loadEnv` lets the environment win over env files; an empty value counts as unset.
   2. Otherwise `<GCSCODE_SITL_HOME>/ardupilot/terrain`, with `GCSCODE_SITL_HOME` defaulting to `~/.gcscode/sitl` as in `run_sitl.sh`; an empty value counts as unset there too.

   A default that `run.sh` exported would beat a user's `.env.local`, and the launcher sets no per-service environment. The config is the one place where `.env.local` still wins. The default also serves `pnpm --filter camera-sim dev`. This is what the roadmap's "that launch can also default `CAMERA_SIM_TERRAIN_DIR`" asked for.

7. **Camera-sim is up when MediaMTX lists `drone-1` as ready.** The check is `GET http://127.0.0.1:9997/v3/paths/list`: an item with `name` `drone-1` and `ready` `true`.
   - It sees the whole chain: page loaded, WebGL, telemetry and WHIP. So "All up." means the Video panel has a stream, which a check of 5174 cannot say.
   - `tools/mediamtx/mediamtx.yml` turns MediaMTX's API on, on loopback only: `api: true`, `apiAddress: 127.0.0.1:9997`. TCP 9997 joins mediamtx's port check.
   - _Measured:_
     - an RTSP `DESCRIBE` probe logs two INF lines in MediaMTX per probe;
     - `/v3/paths/get/drone-1` logs `ERR [API] path not found` per probe while the path is absent;
     - `/v3/paths/list` logged nothing over 21 polls at 250 ms;
     - from 127.0.0.1 the API needs no credentials, through MediaMTX's default `authInternalUsers`;
     - with SITL already running, headless camera-sim published `drone-1` 5.3 s after Chrome started, and the list showed it `ready` with `tracks: ['H264']`.
8. **Deadline: 90 s.** Camera-sim can publish only after SITL's first `HEARTBEAT` (SITL's own deadline is 60 s), then the page's telemetry reconnect (backoff up to 10 s), then a WHIP connect (ICE gathering up to 2 s). A slow SITL is then reported as SITL's failure, not camera-sim's. PR #53 measured the first `HEARTBEAT` at 3.1 s from a cold start.
9. **Table order and addresses.** camera-sim is the last entry, with no `addresses`. Its page would be a second publisher, and the stream's WHEP and RTSP addresses are already in mediamtx's entry.

## Review focus

Inputs the spec implies but no step above names, each pinned by a test in the task named:

1. **Chrome exits by itself** (a crash, or quit from Activity Monitor): `run.sh` stops Vite, removes the profile and exits 1 (Task 1).
2. **5174 is taken when camera-sim runs alone:** the port check prints its message and exits 1, before the profile, Vite or Chrome (Task 1).
3. **A stop before the page is served:** Ctrl-C while Vite is still starting leaves no process and no profile (Task 1).
4. **`drone-1` listed but not ready** (a publisher still connecting), or only `drone-2` ready: not up (Task 2).
5. **MediaMTX's API not answering, or answering an error or non-JSON:** not up, and no throw (Task 2).

## File structure

- `tools/camera-sim/run.sh` (create): the headless start script.
- `tools/camera-sim/run.test.ts` (create): its tests, run by vitest against a stub Chrome on an ephemeral port.
- `tools/camera-sim/src/terrain/terrain-dir.ts` (create), with `terrain-dir.test.ts`: the terrain folder's default.
- `tools/camera-sim/src/status-text.ts` (modify), with its test: `describeWhip()`, shared by the status page and the console line.
- `tools/camera-sim/src/main.ts`: the three console lines.
- `tools/camera-sim/vite.config.ts`: the terrain default, and the test include.
- `tools/camera-sim/tsconfig.json`: includes `run.test.ts`.
- `tools/camera-sim/package.json`: the `start` script.
- `tools/camera-sim/README.md`.
- `tools/mediamtx/mediamtx.yml` and `tools/mediamtx/README.md`: the API.
- `scripts/dev-stack.mjs` and `scripts/dev-stack.test.mjs`: the entry, `MEDIAMTX_API` and `streamReady()`.
- Docs: the spec's Known unknowns entry, `docs/roadmap.md`, the root `README.md` and `CLAUDE.md`.

### Task 1: camera-sim runs headless (`tools/camera-sim`)

**Files:** everything under `tools/camera-sim/` above.

**Interfaces:**

- Produces `tools/camera-sim/run.sh`, executable, with no arguments. It reads `CAMERA_SIM_CHROME`, `CAMERA_SIM_PORT` and `TMPDIR`. Its exits:
  - 1 with the decision-2 message when Chrome is missing;
  - 1 with the decision-1 message when the port is in use;
  - 1 when Chrome or Vite exits by itself;
  - non-zero after a signal.
- Produces `pnpm --filter camera-sim start`, which runs `./run.sh`.
- Produces `terrainDir(env: { readonly CAMERA_SIM_TERRAIN_DIR?: string; readonly GCSCODE_SITL_HOME?: string }, homeDir: string): string` in `src/terrain/terrain-dir.ts`.
- Produces `describeWhip(state: PublisherState, error: string | undefined): string` in `src/status-text.ts`. It returns `WHIP <state>`, plus ` (<error>)` when there is an error, the format the status page's caption uses today.

- [ ] **Step 1: Write the failing unit tests.** In `src/terrain/terrain-dir.test.ts`, with home `/h`:
  - `{ CAMERA_SIM_TERRAIN_DIR: '/t' }` gives `/t`;
  - `{ GCSCODE_SITL_HOME: '/s' }` gives `/s/ardupilot/terrain`;
  - `{}` gives `/h/.gcscode/sitl/ardupilot/terrain`;
  - `{ CAMERA_SIM_TERRAIN_DIR: '  ', GCSCODE_SITL_HOME: '' }` gives `/h/.gcscode/sitl/ardupilot/terrain`.

  In `src/status-text.test.ts`:
  - `describeWhip('publishing', undefined)` gives `WHIP publishing`;
  - `describeWhip('retrying', 'connection failed')` gives `WHIP retrying (connection failed)`.

- [ ] **Step 2: Write the failing `run.test.ts`.** Each test makes a fresh temp folder and runs `run.sh` in its own process group (`detached`) with three variables:
  - `TMPDIR` set to a fresh folder;
  - `CAMERA_SIM_PORT` set to an ephemeral port bound and released;
  - `CAMERA_SIM_CHROME` set to a stub Chrome the test writes.

  The stub is an executable `sh` script. It writes its PID and its arguments, one per line, into the test's folder. It records the HTTP status of its last argument, using `curl`. It writes two stderr lines, then `exec sleep 600`, or exits with the code the test sets:
  - `[1:2:3:INFO:CONSOLE:7] "drone-1 WHIP publishing", source: http://localhost/src/main.ts (7)`;
  - `[1:2:3:ERROR:ui/display/mac/cv_display_link_mac.mm:188] CVDisplayLinkCreateWithCGDisplay failed.`

  After each test, kill the script's group with SIGKILL by its PID and remove the folders. Give each test a 20 s timeout. The tests:
  - `it starts Chrome headless on a fresh profile once the page is served`:
    - the stub's arguments include `--headless=new`, `--enable-logging=stderr` and `--log-level=0`;
    - they include one `--user-data-dir=<dir>`, where `<dir>` is in `TMPDIR` and exists;
    - the last argument is `http://localhost:<port>/`;
    - the status the stub recorded is `200`.
  - `it prints the page's console lines and drops Chrome's own`: the output has `page: drone-1 WHIP publishing` and no `CVDisplayLink`.
  - For each of SIGTERM, SIGINT and SIGHUP, `a <signal> to its process group stops everything and removes the profile`:
    - it exits within 5 s;
    - the stub's PID is gone;
    - the port no longer accepts;
    - `TMPDIR` is empty.
  - `Chrome exiting by itself stops the dev server and exits 1` (the stub exits 3):
    - exit code 1;
    - stderr has `ERROR: Chrome exited (code 3).`;
    - the port is free and `TMPDIR` is empty.
  - `a port already in use stops it before anything starts` (the test holds the port on `::1`):
    - exit code 1;
    - stderr is exactly the decision-1 message with the port;
    - no stub PID file;
    - `TMPDIR` is empty.
  - `a missing Chrome stops it before anything starts` (`CAMERA_SIM_CHROME` names a path that does not exist):
    - exit code 1 within 2 s;
    - stderr is exactly the decision-2 message with that path;
    - `TMPDIR` is empty.
  - `a stop before the page is served removes the profile`: send SIGTERM once `TMPDIR` holds the profile but before the stub has run, then check that `TMPDIR` is empty and nothing is left.

- [ ] **Step 3: Run them and watch each fail for the right reason:** `cd <worktree> && pnpm --filter camera-sim test`.
- [ ] **Step 4: Implement.**
  - `terrainDir()`.
  - `describeWhip()`, which the caption in `main.ts` then uses.
  - `vite.config.ts` passes `terrainDir({ CAMERA_SIM_TERRAIN_DIR: env.CAMERA_SIM_TERRAIN_DIR, GCSCODE_SITL_HOME: process.env.GCSCODE_SITL_HOME }, homedir())` to `sitlTerrain`, and its `test.include` adds `run.test.ts`.
  - `tsconfig.json` includes `run.test.ts`.
  - `"start": "./run.sh"` in `package.json`.
  - `run.sh` per decisions 1–5.
  - In `main.ts`, the three `console.info` lines of decision 5: through `MavlinkSocket`'s `onStateChange`, once after the terrain loads, and through `WhipPublisher`'s `onStateChange`, using `describeWhip(state, detail)`.
- [ ] **Step 5: Run `pnpm --filter camera-sim test` and `pnpm --filter camera-sim check`;** both pass. Then mutate each branch of `run.sh`, watch the named test fail, and restore. The branches:
  - the Chrome check;
  - the port check;
  - the wait for the port;
  - the exit poll;
  - the trap's kill;
  - the profile's removal;
  - the `sed` filter.

  Do the same for each case of `terrainDir()`.

- [ ] **Step 6: Update `tools/camera-sim/README.md`.**
  - **Running it:** `pnpm dev:sitl` now starts camera-sim with the rest, headless. `pnpm --filter camera-sim start` runs it headless alone, and needs Google Chrome. The visible tab of step 4 stays the way to see the status page and the ground check.
  - **Step 2** becomes optional. The terrain folder defaults to SITL's, and `.env.local` is only for another folder.
  - **Never open the page while a headless camera-sim runs:** two pages take `drone-1` from each other in turn.
  - **Settings:** add the environment variables `CAMERA_SIM_CHROME`, `CAMERA_SIM_PORT` and `CAMERA_SIM_TERRAIN_DIR`.
  - **Known limits:**
    - "The window must stay visible" applies to a visible tab only.
    - Headless costs about 55% of one core and 500 MB.
  - **Layout:** add `run.sh`.
- [ ] **Step 7: `pnpm format`, `pnpm lint`, commit:** `feat(camera-sim): run headless with pnpm --filter camera-sim start`.

### Task 2: the launcher's camera-sim entry (`scripts/dev-stack.mjs`, `tools/mediamtx`)

**Files:**

- `scripts/dev-stack.mjs` and `scripts/dev-stack.test.mjs`;
- `tools/mediamtx/mediamtx.yml` and `tools/mediamtx/README.md`.

**Interfaces:**

- Consumes `tools/camera-sim/run.sh` (Task 1).
- Produces:
  - `export const MEDIAMTX_API = 'http://127.0.0.1:9997'`;
  - `export async function streamReady(baseUrl, name)`, which resolves to a `boolean` and never throws;
  - the `camera-sim` entry in `SERVICES`.

- [ ] **Step 1: Write the failing tests** in `scripts/dev-stack.test.mjs`. Reuse its `serve()` stub.
  - `streamReady is true when MediaMTX lists the path as ready`:
    - the body is `{"itemCount":1,"pageCount":1,"items":[{"name":"drone-1","ready":true,"tracks":["H264"]}]}`;
    - the result is `true`;
    - the URL requested ends with `/v3/paths/list`.
  - `streamReady is false for a path listed but not ready`.
  - `streamReady is false when only another path is ready` (`drone-2`).
  - `streamReady is false for an empty list`, `for a body that is not JSON`, `for an error status` (500, with a JSON body listing `drone-1` ready) and `when nothing listens`.
  - `SERVICES is the spec's table`, extended:
    - mediamtx's ports are TCP 8554, 8889, 9997, then UDP 8000, 8001, 8189;
    - a fourth entry `{ name: 'camera-sim', command: join(ROOT, 'tools/camera-sim/run.sh'), args: [], cwd: ROOT, ports: [{ proto: 'tcp', port: 5174 }], upWithinMs: 90000 }` with `addresses` `[]`;
    - the X_OK check covers the three scripts;
    - `MEDIAMTX_API` is `http://127.0.0.1:9997`.
  - `MediaMTX's config serves the API the launcher reads`: `tools/mediamtx/mediamtx.yml` has the lines `api: true` and `apiAddress: 127.0.0.1:9997`, and that address is `MEDIAMTX_API`'s host and port.
- [ ] **Step 2: Run them and watch each fail for the right reason:** `cd <worktree> && node --test scripts/dev-stack.test.mjs`.
- [ ] **Step 3: Implement.**
  - **`streamReady`** follows `fetchMessage`: a `PROBE_MS * 2` timeout, `response.ok` required, and any error means `false`.
  - **The entry**'s `up` is `() => streamReady(MEDIAMTX_API, 'drone-1')`.
  - **The config:** add the two lines to `mediamtx.yml`, and extend its comment to say the launcher reads the path list from the API on 127.0.0.1:9997.
  - **The README:** add TCP 9997 (API, loopback only) to `tools/mediamtx/README.md`'s ports.
- [ ] **Step 4: Run `pnpm test:scripts`; it passes.** Mutate each new branch, watch the named test fail, and restore:
  - `streamReady`'s name match;
  - its `ready` check;
  - its `ok` check;
  - its catch;
  - the table values.
- [ ] **Step 5: `pnpm format`, `pnpm lint`, commit:** `feat(dev-stack): start camera-sim headless with the stack`.

### Task 3: the docs

**Files:**

- `docs/specs/2026-11-10-dev-stack.md`;
- `docs/roadmap.md`;
- `README.md`;
- `CLAUDE.md`;
- this plan.

- [ ] **Step 1: The spec's Known unknown "Camera-sim headless"** gets one appended sentence: "_Outcome, 2026-11-10:_ passed: …". It gives the measurements of § The headless test above in one line, and links this plan for camera-sim's entry in the launcher. This records the outcome where the entry expects it. It changes no decision, so it needs no successor spec.
- [ ] **Step 2: The roadmap.**
  - **Camera sim, after v0:** drop the two cuts and the terrain default, which this PR ships, and keep the rest. Add a shipped entry before it: **Camera sim headless, in the dev stack** (PR number, this plan).
  - **One-command dev stack:** "Camera-sim joins in a later PR" becomes "Camera-sim joined in PR #<n>, headless".
- [ ] **Step 3: The root `README.md`'s "Running it"** names camera-sim in a headless Chrome among what `pnpm dev:sitl` starts, and Google Chrome as a requirement. `CLAUDE.md` § Commands: "run SITL, MediaMTX, camera-sim and the dev server together".
- [ ] **Step 4: Run `pnpm lint:docs` and `pnpm lint`, then commit:** `docs: camera-sim joins the dev stack`.

### Verification by hand (controller, after Task 3)

These need the stack's ports. The owner's own `pnpm dev:sitl` holds them, and their camera-sim page in the desktop app's browser pane publishes `drone-1`, which would also publish into this stack's MediaMTX. The controller asks the owner to stop both; this session never stops them. Record each result in the PR body under "Verified by hand".

- [ ] **H1, cold start.** Run `pnpm dev:sitl` on a pseudo-terminal. Record the seconds from launch to:
  - each service up;
  - `camera-sim is up` (`drone-1` ready);
  - "ready to fly".

  Check that the output shows camera-sim's page lines:
  - `Telemetry` states;
  - `Terrain` naming the `.DAT` file, which proves the terrain default;
  - `drone-1 WHIP publishing`.

  Then open http://localhost:5173/ in the browser pane. The Video panel plays `drone-1`. MediaMTX logs one WebRTC session publishing to `drone-1`, and no browser shows a camera-sim tab. This also exercises the spike's untested path: the page loads before mavlink2rest answers.

- [ ] **H2, no visible tab.** With no camera-sim tab anywhere, the Video panel keeps playing for 5 minutes: `getVideoPlaybackQuality()`'s decoded frames keep rising. Meanwhile `pnpm fly-sitl --circle 3` flies the drone, so the picture moves.
- [ ] **H3, one Ctrl-C.** Afterwards:
  - no process of the recorded groups is left;
  - no process has the profile folder in its arguments;
  - the profile folder is gone;
  - no table port is held.
- [ ] **H4, missing Chrome.** Run `CAMERA_SIM_CHROME=/nonexistent/chrome pnpm dev:sitl`. Expect:
  - camera-sim fails during startup with the decision-2 message;
  - the launcher stops the others, shows camera-sim's last lines and exits 1;
  - nothing is left.

## Checklist: spec findings left for implementation

The final cross-cutting review verifies each item.

- [ ] **Known unknown, camera-sim headless:** the outcome is in the spec's entry (Task 3), and camera-sim joined in its own PR, this one.
- [ ] **§ Camera-sim's slot:** one table entry, its dev server on 5174 plus a headless Chrome (Tasks 1 and 2). H1 proves the stream.
- [ ] **§ Port check:** TCP 5174 and 9997 are checked before anything starts (Task 2's table test). The generic `checkPorts` tests cover the refusal.
- [ ] **§ Setup not run:** a missing Chrome stops the launch with a message in the setup messages' style (Task 1 test, H4).
- [ ] **§ Stopping:** one Ctrl-C leaves no Chrome, Vite or stack process and no port held (Task 1 tests, H3).
- [ ] **Roadmap, Camera sim after v0:** `CAMERA_SIM_TERRAIN_DIR` defaults to SITL's terrain folder (Task 1, H1).
- [ ] **Known unknown, Apple Silicon:** stays untested; the PR body says so.
- [ ] **Out of scope, as the task set it:** mavlink2rest's bind address, and the roadmap's later camera-sim list.

## Not in this PR

Each item with why, and what brings it back.

- **Imagery status and the ground check stay on the status page only.** The output carries page errors, telemetry, terrain and WHIP state (decision 5). Revisit when a ground MISMATCH or failing imagery goes unseen under the launcher.
- **Another camera-sim page publishing `drone-1`** (a visible tab left open) also satisfies the up check, and the two pages take the path from each other. The README says never to open the page while a headless one runs.
  - **It happened** in the first cold start of the hand checks. A tab left open in the desktop app's browser pane published first, and the launcher counted it as camera-sim being up.
  - **Kept deferred** on the controller's recommendation, which the owner left standing.
  - **A fix would only fix the "up" line.** A marker in the headless page's WHIP address, read back through MediaMTX's API, would make the "up" line accurate. The two pages would still fight over the path.
  - **MediaMTX's `overridePublisher: no` is the lever for the fight.** It keeps the path with the first publisher.
  - **Revisit when** a forgotten tab costs time again under the launcher, or when two publishers of one path are expected (camera-sim on several machines).
- **`drone-1` going offline after "All up" goes unnoticed,** as arducopter dying does (PR #53's deferrals). Revisit with that one.
- **A SIGKILL leaves the Chrome profile in `TMPDIR`** (decision 4). Revisit if the folders pile up.
- **`CAMERA_SIM_PORT` set in the shell** makes camera-sim listen elsewhere while the launcher checks 5174. Revisit if anyone sets it for good.
- **Untested:**
  - a locked screen or a sleeping display;
  - runs longer than H2;
  - Apple Silicon;
  - several vehicles.
