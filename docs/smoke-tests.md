# Smoke tests

Hands-on checks for each rung, run on the owner's Mac against the real stack. A unit test proves the code; a smoke test proves the rung does what its ticket says with real SITL, a real radio and a real browser.

Every command block runs from the repo root of the checkout being tested: the main checkout for merged code, or a PR's worktree, `.worktrees/pr-<n>`, for a draft. Each block stands on its own, so a markdown viewer that runs blocks can play them one at a time. A block marked **runs until Ctrl-C** gets a terminal of its own.

Results go to each test's Linear ticket, through `pnpm smoke` ([Recording results](#recording-results)). This page holds the tests only. A ticket in the table waits in **Smoke Test** after its PRs merge, until a pass moves it to Done.

| Test                                                  | Ticket / PR      | Needs                  |
| ----------------------------------------------------- | ---------------- | ---------------------- |
| [Video health view](#video-health-view)               | GCS-15, PR #65   | SITL                   |
| [Radio probe](#radio-probe)                           | GCS-13, PR #63   | TX16S, Rust and CMake  |
| [Several vehicles in SITL](#several-vehicles-in-sitl) | GCS-16, PR #66   | SITL                   |
| [Wire probe](#wire-probe)                             | GCS-17, PR #70   | SITL                   |
| [Map input view](#map-input-view)                     | GCS-14, PR #71   | SITL                   |
| [Link state view](#link-state-view)                   | GCS-24, PR #69   | SITL                   |
| [Radio input view](#radio-input-view)                 | GCS-38, PR #68   | TX16S, Rust and CMake  |
| [Station in the dev stack](#station-in-the-dev-stack) | GCS-29, PR #81   | SITL, Rust and CMake   |
| [Controls view](#controls-view)                       | GCS-40, PR #82   | TX16S, Rust and CMake  |
| [Palettes](#palettes)                                 | GCS-104, PR #99  | nothing                |
| [Smoke test runner](#smoke-test-runner)               | GCS-114, PR #PRN | a Linear key, and `gh` |

## Before you start

To test merged code, bring the main checkout up to date:

```sh
git switch master && git pull --ff-only && pnpm install
```

To test an open PR, give it a worktree named after it, so the main checkout never changes branch (replace `<n>` with the PR's number):

```sh
git fetch origin pull/<n>/head && git worktree add --detach .worktrees/pr-<n> FETCH_HEAD && cd .worktrees/pr-<n> && pnpm install
```

And after review pushes to the PR, bring that worktree up to the PR's latest head:

```sh
git -C .worktrees/pr-<n> fetch origin pull/<n>/head && git -C .worktrees/pr-<n> checkout --detach FETCH_HEAD && (cd .worktrees/pr-<n> && pnpm install)
```

Run each test's commands, and `pnpm smoke`, in the checkout being tested: the main checkout, or `.worktrees/pr-<n>` for a PR.

`pnpm dev:sitl` also starts the station process, which needs Rust and CMake and a build after each change to it, in the checkout being tested:

```sh
pnpm --filter mavlink-station run setup
```

Only one stack can run at a time, since they share ports: stop the last one with Ctrl-C before starting the next.

Two helpers the scenarios below use. Freeze vehicle 2's MAVProxy, so the vehicle goes quiet without anything exiting (vehicle 2's MAVProxy is the only process whose command line names TCP 5770):

```sh
pkill -STOP -f 'tcp:127.0.0.1:5770'
```

And let it go again:

```sh
pkill -CONT -f 'tcp:127.0.0.1:5770'
```

## Recording results

Start the runner in the checkout being tested (**runs until Ctrl-C**). It opens its page at `http://127.0.0.1:5180/`:

```sh
pnpm smoke
```

It needs a Linear personal API key (Linear, Settings, Security & access, Personal API keys), in `LINEAR_API_KEY` or in `~/.config/gcscode/linear-api-key`, and `gh` signed in. In the main checkout on master's tip it lists every test whose ticket waits, or closed without a pass. In `.worktrees/pr-<n>` it lists only the tests that PR belongs to, and records their results as that PR's draft.

For each test, run its steps and mark each scenario **Pass**, **Fail** with a line on what went wrong, or **Not run**. Put anything else you noticed in **Note a finding**, one per line, and attach a screen recording if you made one. **Submit** then writes to each marked test's ticket:

- every scenario passed: a "Smoke test passed" comment, and on merged code the ticket moves to Done;
- any scenario failed: a "Smoke test failed" comment with your notes, and the ticket moves to In Progress;
- some passed, the rest not run: a "Smoke test partly run" comment, and the ticket stays where it is.

Each finding becomes a Backlog ticket related to the test's. If a write fails, the page says which, and **Send what did not land** sends only those. Then copy the summary line the page shows into the project chat.

A test passed on a PR's draft is offered again on master once the PR merges, with **Count the draft pass** and the commits that PR gained after the pass, so you can count it or run the test again.

## Video health view

**Goal:** the **Video health** tab tells a live picture from a frozen one: connection state, frames per second, time since the last new frame, bitrate and packet loss for the Video panel's stream. Its README: [`packages/extension-video`](../packages/extension-video/README.md#the-video-health-view).

Start the stack (**runs until Ctrl-C**). Once the launcher says everything is up (a pause during startup trips its checks and stops the stack), open gcscode and drag the **Video health** tab next to the **Video** panel, so both show at once:

```sh
pnpm dev:sitl
```

```sh
open http://localhost:5173/
```

**Expect:** the Video panel plays vehicle 1's camera, and Video health reads `connected`, about 30 frames per second, a time since the last new frame under a second, and a bitrate above 0.

**Scenario 1, a frozen picture:** freeze camera-sim's headless Chrome, so it stops sending frames while MediaMTX and the panel's connection stay up (each of its processes names the `camera-sim-chrome` profile on its command line):

```sh
pkill -STOP -f camera-sim-chrome
```

**Expect:** within a second the picture stops, frames per second drop to 0 and the time since the last new frame keeps growing, while the state still reads `connected`. Let it go again within about 10 s, well inside the roughly 30 s after which MediaMTX drops a silent publisher:

```sh
pkill -CONT -f camera-sim-chrome
```

**Expect:** the picture moves again, and within a few seconds it is back to about 30 frames per second and a time since the last new frame under a second. If camera-sim republishes on waking, the state briefly leaves `connected` and the panel reconnects on its own; that is not a failure.

**Scenario 2, the media server goes away:** freeze MediaMTX, so it stops answering without exiting (an exit would stop the whole stack):

```sh
pkill -STOP -x mediamtx
```

**Expect:** frames per second drop to 0 at once, and within about 10 s the state leaves `connected`: `disconnected`, then `no connection`, then, while the panel retries, `new` for up to 15 s at a time with `no connection` between tries. Once it has read `new` or `no connection`, let it go again:

```sh
pkill -CONT -x mediamtx
```

**Expect:** within about 15 s the state is `connected` again and the picture moves, without touching the page. On the way it may pass through `no connection`, `new` and `connecting` while camera-sim republishes; that is not a failure.

## Radio probe

**Goal:** the terminal shows the TX16S's raw input live: every axis, button and hat SDL reports, read and nothing more. Its README: [`tools/radio-probe`](../tools/radio-probe/README.md).

Needs Rust and CMake (`brew install cmake`). No SITL. Start the probe (**runs until Ctrl-C**; its first build compiles SDL and takes a few minutes):

```sh
pnpm --filter radio-probe start
```

Then plug in the radio and choose **USB Joystick (HID)** when it asks.

**Expect:** an `opened … TX16SMK3 Joystick  1209:4f54  (EdgeTX radio)` line with its serial and counts (8 axes, 24 buttons, 0 hats), then the axes table, the button grid, the `pressed:` line and `input events in the last second`.

**Scenario 1, sticks and switches:** move each stick, then flip each switch. **Expect:** a moving stick's bar moves while it moves, from -32768 to 32767 at its ends; a switch's button lights up and shows on the `pressed:` line; the events count rises while you move and drops to 0 when you stop. In Classic mode the values are the model's channel outputs, so they follow its mixer.

**Scenario 2, unplug:** unplug the radio, then plug it back in. **Expect:** a line saying it is gone and the probe waiting, then the radio opened again.

**Scenario 3, terminal in the background:** bring another app to the front and move a stick. **Expect:** the values still change. If nothing changes at all, macOS needs Input Monitoring for the terminal (System Settings, Privacy & Security, Input Monitoring).

## Several vehicles in SITL

**Goal:** `pnpm dev:sitl --vehicles N` runs N vehicles on system IDs 1 to N, each with its own camera stream, and one Ctrl-C stops all of them.

Start the stack with five vehicles (**runs until Ctrl-C**):

```sh
pnpm dev:sitl --vehicles 5
```

**Expect:** the launcher prints a WHEP and an RTSP address for each of vehicles 1 to 5 (`drone-1` to `drone-5`) and gcscode at `http://localhost:5173/`, and then stays up. In gcscode, the **Map input** tab lists five rows, systems 1 to 5. All five start at the same home, so their markers overlap on the map.

Look at vehicle 5's camera in MediaMTX's own player page:

```sh
open http://localhost:8889/drone-5/
```

Then press Ctrl-C once in the stack's terminal. **Expect:** everything stops. This prints any port still listening, or `all stopped`:

```sh
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(5760|5770|5780|5790|5800|8088|5173|8889)\b' || echo 'all stopped'
```

## Wire probe

**Goal:** with two vehicles running, each vehicle's heartbeats show at about 1 Hz under its own system ID. The probe only listens. Its README: [`tools/wire-probe`](../tools/wire-probe/README.md).

Start two vehicles (**runs until Ctrl-C**):

```sh
pnpm dev:sitl --vehicles 2
```

Start the probe in a second terminal (**runs until Ctrl-C**):

```sh
pnpm --filter wire-probe start
```

**Expect:** a `HEARTBEAT` row for system 1 and one for system 2, each with a **last gap** of about `1.000 s` and a **last seen** under a second.

**Scenario, a quiet vehicle:** freeze vehicle 2 with the helper above. **Expect:** system 2's **last seen** keeps growing while system 1's stays under a second. Let it go again, and its heartbeats come back under the same row.

To keep a record for later, save 30 seconds of frames to a file:

```sh
pnpm --filter wire-probe start -- --record /tmp/wire-probe.jsonl --seconds 30
```

## Map input view

**Goal:** the **Map input** tab shows, per vehicle, exactly what the map is fed: position, heading and home, how long ago each was received and last changed, and where it came from.

Start two vehicles (**runs until Ctrl-C**), then open gcscode and click the **Map input** tab:

```sh
pnpm dev:sitl --vehicles 2
```

```sh
open http://localhost:5173/
```

**Expect:** a row for system 1 and one for system 2, each with a position, a heading and a home, all received well under a second ago. A home can show the bridge's stored copy as its source; that is the extension reading mavlink2rest, not asking the vehicle.

**Scenario, one vehicle moves:** fly vehicle 1 (`fly-sitl` flies vehicle 1 only):

```sh
pnpm fly-sitl --circle 3
```

**Expect:** system 1's position and heading change and their **changed** ages stay small; system 2's stay put.

**Scenario, a quiet vehicle:** freeze vehicle 2 with the helper above. **Expect:** system 2 keeps its row and its ages grow. Let it go again, and it is back to fresh within about 3 s, on the same row.

**Known issue, not a failure:** the line above the rows, which names the vehicle the map is drawing, keeps switching between systems. The merged telemetry store is last-writer-wins; GCS-62 fixes it.

## Link state view

**Goal:** the **Link state** tab shows whether the mavlink2rest bridge is up, and for each system ID how long ago its last heartbeat arrived. Its `station` line, from PR #81, has a test of its own: [Station in the dev stack](#station-in-the-dev-stack).

Start two vehicles (**runs until Ctrl-C**), then open gcscode and click the **Link state** tab:

```sh
pnpm dev:sitl --vehicles 2
```

```sh
open http://localhost:5173/
```

**Scenario 1, both fresh. Expect:** the bridge `up for …`, and systems 1 and 2 each under about a second ago.

**Scenario 2, one vehicle stopped:** freeze vehicle 2 with the helper above. **Expect:** system 2's age keeps growing while system 1's stays under a second. Let vehicle 2 go again before scenario 3.

**Scenario 3, bridge down:** stop mavlink2rest:

```sh
pkill -x mavlink2rest
```

**Expect:** the bridge `down for …`, a line saying a reload is needed once mavlink2rest is back, and every age growing. gcscode does not reconnect yet, so stop the stack with Ctrl-C afterwards.

## Radio input view

**Goal:** the **Radio input** tab shows the TX16S's raw input, the same values the terminal probe prints, served by the station process. Reloading or closing the page changes nothing for the station. **Proof is a screen recording** (Cmd-Shift-5) with the page and the terminal probe side by side.

Needs the TX16S on USB as a joystick, and Rust and CMake (`brew install cmake`). No SITL. Start the station (**runs until Ctrl-C**; its first build compiles SDL and takes a few minutes):

```sh
pnpm --filter mavlink-station start
```

Start the dev server in a second terminal (**runs until Ctrl-C**), then open gcscode and click the **Radio input** tab:

```sh
pnpm dev
```

```sh
open http://localhost:5173/
```

Start the terminal probe in a third terminal (**runs until Ctrl-C**):

```sh
pnpm --filter radio-probe start
```

**Scenario 1, sticks and switches:** start the recording, then move each stick and flip each switch. **Expect:** the page's axes and its `pressed:` buttons match the probe's at each moment.

**Scenario 2, reload:** reload the page, then close the tab and open it again. **Expect:** the station's terminal shows nothing new and keeps running, and the page picks the input up again.

**Scenario 3, station gone:** press Ctrl-C in the station's terminal. **Expect:** the page says the station is gone and retries every 2 s; start the station again and the page picks it up.

## Station in the dev stack

**Goal:** the station process starts with `pnpm dev:sitl`, the **Link state** tab shows `station: running` or `station: not running`, stopping the process flips it, and it sends nothing to any vehicle: the wire probe confirms.

Build the station once, and again after its code changes (the first build compiles SDL and takes a few minutes):

```sh
pnpm --filter mavlink-station run setup
```

Start two vehicles (**runs until Ctrl-C**), then open gcscode and click the **Link state** tab:

```sh
pnpm dev:sitl --vehicles 2
```

```sh
open http://localhost:5173/
```

**Expect:** the launcher prints `station | station: serving radio input on ws://127.0.0.1:8091/ws`, and once the vehicles are ready to fly, a `Station` line with `ws://127.0.0.1:8091/ws` among the addresses. The Link state tab shows `station` `running for …` with `(gcscode-station 0.1.0)`, the bridge up, and systems 1 and 2 under a second ago.

**Scenario 1, it sends nothing:** start the wire probe in a second terminal (**runs until Ctrl-C**):

```sh
pnpm --filter wire-probe start
```

**Expect:** the same rows as without the station: `HEARTBEAT` from systems 1 and 2 only, and no command or control frame among the latest frames. The station has no MAVLink code yet, so nothing it does can show up here.

**Scenario 2, the station stops:** freeze it, so it goes quiet without exiting (an exit would stop the whole stack):

```sh
pkill -STOP -x gcscode-station
```

**Expect:** within 3 s the Link state tab shows `station` `not running for …` in red, with a line saying nothing answers at `ws://127.0.0.1:8091/ws` and how to start it. Mavlink2rest and the vehicles' ages are unaffected. Let it go again:

```sh
pkill -CONT -x gcscode-station
```

**Expect:** within about 2 s it is `running` again, its time counting from 0.

**Scenario 3, one Ctrl-C:** press Ctrl-C in the stack's terminal. **Expect:** `Stopping sitl, mediamtx, gcscode, camera-sim, station`, then `Stopped.` This prints any port still listening, or `all stopped`:

```sh
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(5760|5770|8088|5173|5174|8889|8091)\b' || echo 'all stopped'
```

## Controls view

**Goal:** a profile file says what each radio input means to gcscode. With the gcscode-adv profile, the **Controls** tab and `radio-probe --mapped` show "throttle 37%", "SA middle" and "control on" live, next to the raw values. **Proof is a screen recording** (Cmd-Shift-5) with the page and the probe side by side.

Needs the TX16S on USB as a joystick, on its `gcscode-adv` model ([`tools/radio-probe/tx16s-advanced-model.md`](../tools/radio-probe/tx16s-advanced-model.md)), and Rust and CMake. No SITL.

Plug in the radio on `gcscode-adv` first, then start the station (**runs until Ctrl-C**):

```sh
pnpm --filter mavlink-station start
```

**Expect:** `station: radio profiles gcscode-adv`, the `opened … TX16SMK3 Joystick` lines with `buttons 28`, then `station: mapped with profile gcscode-adv`.

Start the dev server in a second terminal (**runs until Ctrl-C**), then open gcscode and click the **Controls** tab:

```sh
pnpm dev
```

```sh
open http://localhost:5173/
```

Start the probe with the profile in a third terminal (**runs until Ctrl-C**):

```sh
pnpm --filter radio-probe start -- --mapped
```

**Scenario 1, no position yet:** before touching a switch, look at the Controls tab. **Expect:** every switch reads `unknown`, since the radio's connect burst came before the station opened it.

**Scenario 2, sticks:** start the recording. Let the sticks rest, then move each to both ends. **Expect:** roll, pitch and yaw read `0%` at rest and `-100%` and `100%` at their ends; throttle reads `0%` to `100%`; the probe's control column shows the same numbers.

**Scenario 3, a Pulse switch:** move SA to the middle and wait a second. **Expect:** `SA middle`, still there after the 0.2 s press has ended (the Radio input tab shows button 1 flash, then nothing). Move it up and down. **Expect:** `up`, then `down`. Do the same for SB to SG.

**Scenario 4, the control switch:** turn the control switch on, then off. **Expect:** `control on`, highlighted, then `control off`.

**Scenario 5, unmapped inputs:** press SH and SW1 to SW6. **Expect:** nothing named changes, and `unmapped buttons: 21, 22, 23, 24, 25, 26, 27` lists them.

**Scenario 6, the connect burst:** unplug the radio, set SA up and SF down, and plug it back in. **Expect:** the station opens it again and the switches show their positions right away, or `unknown` if the burst came before the station opened the radio. Write down which: it decides whether a later rung can count on the burst.

**Scenario 7, a refused profile:** stop the station, then start it with a profile that maps the control switch to a switch position (**exits at once**):

```sh
sed 's/^control = .*/control = { switch = "SF", position = "down" }/' libs/radio-input/profiles/gcscode-adv.toml > /tmp/refused.toml && pnpm --filter mavlink-station start -- --profile /tmp/refused.toml
```

**Expect:** `station: profile /tmp/refused.toml refused: control may only map to a held button …`, and the station exits.

**Scenario 8, no profile:** select the Classic `gcscode` model and replug, then start the station again. **Expect:** `no profile matches this radio (8 axes, 24 buttons)` in its terminal, then `profile gcscode-adv expects 28 buttons, the radio has 24`, and the Controls tab says no profile matches; the Radio input tab still shows raw input.

## Palettes

**Goal:** the command palette and the extensions panel take the keyboard as soon as they open, only one of them is open at a time, both hang from the bottom of the title bar, and the app still reads as working with every extension disabled.

Start the dev server (**runs until Ctrl-C**), then open gcscode:

```sh
pnpm dev
```

```sh
open http://localhost:5173/
```

**Scenario 1, focus:** click a tab, then press Ctrl+Shift+P and type `show`. **Expect:** the letters appear in the palette's box without clicking it, the up and down arrows move the highlight, and the palette sits flush against the bottom of the title bar.

**Scenario 2, one at a time:** with the palette open, press Ctrl+Shift+X. **Expect:** the palette closes and the extensions panel opens in its place, ready to type in. Press Ctrl+Shift+P. **Expect:** the panel closes and the palette opens.

**Scenario 3, every extension disabled:** in the extensions panel, click Disable on every row. **Expect:** the arrow keys and Escape still work after each click, and Escape closes the panel. The empty layout says **No views open** and names Ctrl+Shift+X and Ctrl+Shift+P; Ctrl+Shift+P opens a palette that lists the two Workbench commands. Turn the extensions back on with Ctrl+Shift+X.

## Smoke test runner

**Goal:** `pnpm smoke` lists the tests waiting for a smoke test, records each result as a comment on its Linear ticket, moves the ticket as the result says, turns findings into tickets, and gives one line to paste into the project chat. Run it together with the Controls view retest, which it records.

Needs a Linear key and `gh` signed in ([Recording results](#recording-results)). In the main checkout on master's tip, start the runner (**runs until Ctrl-C**):

```sh
pnpm smoke
```

**Expect:** the page opens at `http://127.0.0.1:5180/` and shows the checkout's commit "on master's tip". It lists Controls view with GCS-40 in Smoke Test and its earlier failed result, and this test with GCS-114, and no test whose last result passed on master.

**Scenario 1, record the Controls view retest:** run [Controls view](#controls-view), marking each of its scenarios as you go, attach its screen recording, and press **Submit**. **Expect:** each write ticks off. GCS-40 has a comment that opens "Smoke test passed on <today> at `<commit>` (master)" (or failed, with your notes), lists every scenario of the test with its result and links the recording, and GCS-40 is Done (In Progress if it failed). The page shows a line that starts `Smoke run <today> at`, and **Copy** puts it on the clipboard.

**Scenario 2, only its own page:** in a second terminal, ask as another site would:

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: example.com' http://127.0.0.1:5180/api/state
```

```sh
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: text/plain' -d x http://127.0.0.1:5180/api/run
```

**Expect:** `403`, then `415`.

**Scenario 3, a finding and this test's own result:** in this test's **Note a finding**, write `Smoke runner finding check, close me`. Mark Start and scenarios 1 and 2 as you saw them, and this one Pass, then press **Submit**. **Expect:** a new Backlog ticket with that title, related to GCS-114, whose ID the summary line lists under findings, and on GCS-114 a "Smoke test passed" comment listing the finding. GCS-114 is Done. If any of this is not so, record this test again with scenario 3 failed. Cancel the finding's ticket afterwards.

## Adding a test

Add a row to the table and a section in this shape, in the order the rungs land:

````md
## <View or tool name>

**Goal:** <what the rung proves, in the ticket's words>.

Start <what> (**runs until Ctrl-C**):

```sh
<one command>
```

**Expect:** <what you should see>.

**Scenario, <name>:** <what to do>. **Expect:** <what you should see>.
````

The row names the rung's one ticket and the PR that adds the test, and never changes when that PR merges. The PR names the ticket with `Ticket: Part of GCS-<n>`, so the merge leaves it open for its smoke test. A scenario runs from its `**Scenario …:**` paragraph to the next one, and an **Expect** before the first scenario starts one named "Start". No command names a worktree: blocks run from the checkout being tested. `pnpm test` checks all of this.
