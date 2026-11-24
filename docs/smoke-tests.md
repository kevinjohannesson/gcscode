# Smoke tests

Hands-on checks for each rung, run on the owner's Mac against the real stack. A unit test proves the code; a smoke test proves the rung does what its ticket says with real SITL, a real radio and a real browser.

Every command block runs from the repo root of the main checkout, and each block stands on its own, so a markdown viewer that runs blocks can play them one at a time. A block marked **runs until Ctrl-C** gets a terminal of its own.

| Test                                                  | Ticket / PR    | Branch                                | Needs                 |
| ----------------------------------------------------- | -------------- | ------------------------------------- | --------------------- |
| [Radio probe](#radio-probe)                           | GCS-13, PR #63 | `master`                              | TX16S, Rust and CMake |
| [Several vehicles in SITL](#several-vehicles-in-sitl) | N8, PR #66     | `master`                              | SITL                  |
| [Wire probe](#wire-probe)                             | GCS-17, PR #70 | `master`                              | SITL                  |
| [Map input view](#map-input-view)                     | GCS-14, PR #71 | `master`                              | SITL                  |
| [Link state view](#link-state-view)                   | GCS-24, PR #69 | `master`                              | SITL                  |
| [Radio input view](#radio-input-view)                 | GCS-38, PR #68 | draft: `claude/project-thread-u456wv` | TX16S, Rust and CMake |
| [Station in the dev stack](#station-in-the-dev-stack) | GCS-29, PR #81 | draft: `claude/project-thread-2l93qj` | SITL, Rust and CMake  |

## Before you start

Bring the main checkout up to date:

```sh
git switch master && git pull --ff-only && pnpm install
```

Once PR #81 has merged, `pnpm dev:sitl` also starts the station process, which needs Rust and CMake and a build after each change to it:

```sh
pnpm --filter mavlink-station run setup
```

A test on a draft branch runs in a worktree under `.worktrees/`, so the main checkout never changes branch. Each such test has its own setup block. Only one stack can run at a time, since they share ports: stop the last one with Ctrl-C before starting the next.

Two helpers the scenarios below use. Freeze vehicle 2's MAVProxy, so the vehicle goes quiet without anything exiting (vehicle 2's MAVProxy is the only process whose command line names TCP 5770):

```sh
pkill -STOP -f 'tcp:127.0.0.1:5770'
```

And let it go again:

```sh
pkill -CONT -f 'tcp:127.0.0.1:5770'
```

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

**Draft PR #68.** Needs the TX16S on USB as a joystick, and Rust and CMake (`brew install cmake`). No SITL. Set up its worktree once:

```sh
git fetch origin claude/project-thread-u456wv && git worktree add --detach .worktrees/radio-input FETCH_HEAD && cd .worktrees/radio-input && pnpm install
```

Start the station (**runs until Ctrl-C**; its first build compiles SDL and takes a few minutes):

```sh
cd .worktrees/radio-input && pnpm --filter mavlink-station start
```

Start the dev server in a second terminal (**runs until Ctrl-C**), then open gcscode and click the **Radio input** tab:

```sh
cd .worktrees/radio-input && pnpm dev
```

```sh
open http://localhost:5173/
```

Start the terminal probe in a third terminal (**runs until Ctrl-C**):

```sh
cd .worktrees/radio-input && pnpm --filter radio-probe start
```

**Scenario 1, sticks and switches:** start the recording, then move each stick and flip each switch. **Expect:** the page's axes and its `pressed:` buttons match the probe's at each moment.

**Scenario 2, reload:** reload the page, then close the tab and open it again. **Expect:** the station's terminal shows nothing new and keeps running, and the page picks the input up again.

**Scenario 3, station gone:** press Ctrl-C in the station's terminal. **Expect:** the page says the station is gone and retries every 2 s; start the station again and the page picks it up.

Remove the worktree when the PR has merged:

```sh
git worktree remove .worktrees/radio-input
```

## Station in the dev stack

**Goal:** the station process starts with `pnpm dev:sitl`, the **Link state** tab shows `station: running` or `station: not running`, stopping the process flips it, and it sends nothing to any vehicle: the wire probe confirms.

**Draft PR #81**, on top of PR #68. Set up its worktree once, which also builds the station (the first build compiles SDL and takes a few minutes):

```sh
git fetch origin claude/project-thread-2l93qj && git worktree add --detach .worktrees/station-startup FETCH_HEAD && cd .worktrees/station-startup && pnpm install && pnpm --filter mavlink-station run setup
```

Start two vehicles from the worktree (**runs until Ctrl-C**), then open gcscode and click the **Link state** tab:

```sh
cd .worktrees/station-startup && pnpm dev:sitl --vehicles 2
```

```sh
open http://localhost:5173/
```

**Expect:** the launcher prints `station | station: serving radio input on ws://127.0.0.1:8091/ws`, and once the vehicles are ready to fly, a `Station` line with `ws://127.0.0.1:8091/ws` among the addresses. The Link state tab shows `station` `running for …` with `(gcscode-station 0.1.0)`, the bridge up, and systems 1 and 2 under a second ago.

**Scenario 1, it sends nothing:** start the wire probe in a second terminal (**runs until Ctrl-C**):

```sh
cd .worktrees/station-startup && pnpm --filter wire-probe start
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
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(5760|5770|8088|5173|8889|8091)\b' || echo 'all stopped'
```

Remove the worktree when the PR has merged:

```sh
git worktree remove .worktrees/station-startup
```

## Adding a test

Add a row to the table and a section in this shape, in the order the rungs land:

````md
## <View or tool name>

**Goal:** <what the rung proves, in the ticket's words>.

**Draft PR #<n>.** <only while it is a draft: the worktree setup block, as above>

Start <what> (**runs until Ctrl-C**):

```sh
<one command>
```

**Expect:** <what you should see>.

**Scenario, <name>:** <what to do>. **Expect:** <what you should see>.
````

When a draft PR merges, drop its worktree blocks and change its row's branch to `master`.
