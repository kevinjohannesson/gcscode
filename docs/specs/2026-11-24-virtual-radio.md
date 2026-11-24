# Virtual radio: record the TX16S once, replay it through SDL

A recorded TX16S session, replayed through an SDL virtual joystick that claims to be the radio, so a station build's radio side reads it exactly as it reads the real one, on macOS, Linux and in CI, with no hand on the sticks. This is the feasibility and scope exploration of the roadmap's [Virtual radio and gamepads](../roadmap.md#tools--coming-committed--will-ship) entry (Linear GCS-86): it settles which of its three options to build, where recordings live and what format they share with `radio-probe` and the station's page protocol.

Decisions are marked _(Owner.)_ or _(Worker.)_; the worker is the session that ran the exploration on 2026-11-24 while the owner was away. Every _(Worker.)_ decision is a default the owner can overturn in review.

## Context

The roadmap entry lists three options, in order: (1) record a real TX16S session and replay it at the station process's input boundary; (2) a virtual USB HID device, so a test goes through SDL as the real radio does, via Linux `uinput`; (3) a software PS4 or other gamepad, once the mapping layer handles more than one kind of controller. It also says that, like every tool, it reaches gcscode only the way real hardware would.

What the station reads today, since PR #68 (GCS-38): the station process of [ADR-0016](../decisions/ADR-0016-one-station-process.md), built as [ADR-0015](../decisions/ADR-0015-native-sidecars.md) says. [`packages/mavlink-station/src/input.rs`](../../packages/mavlink-station/src/input.rs) owns SDL, hands each joystick SDL announces to `radio_probe::probe::Probe`, which opens only USB ID `1209:4f54`, counts input events into `pump::Rate`, and every 20 ms publishes a `Snapshot` of every raw value into a `tokio::sync::watch` channel. The page side serialises that as page protocol 0's `input` message. Nothing downstream of SDL knows where the joystick came from.

`tools/radio-probe/tests/virtual_radio.rs` already drives `Probe` with SDL's virtual joysticks (`SDL_AttachVirtualJoystick`), which SDL provides on every platform it supports, macOS included, with no driver and no permission. That is a fourth input point the roadmap entry did not list, and it changes the answer. It has one limit that shapes everything below: a virtual joystick is a driver inside SDL with no device in the operating system, so only the process that attached it can open it. A C replay therefore never reaches the unchanged shipped `gcscode-station`; it runs inside a station build that links the player, a test or a replay binary.

So there are four places a recorded session could enter:

| Where it enters                                                      | What runs as in production                                                                    | Platforms                                    | Deterministic                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------ |
| A. The page protocol: a fake station that replays `input` messages   | the page only                                                                                 | anywhere Node runs                           | yes                            |
| B. The `watch` channel: snapshots pushed in place of `input::run`    | the page side and the page                                                                    | anywhere                                     | yes                            |
| C. An SDL virtual joystick claiming `1209:4f54`, in the same process | SDL's joystick layer, `Probe`, `Rate`, the snapshot, the page side, the page                  | macOS, Linux, CI                             | yes on a virtual clock (below) |
| D. A kernel virtual device (`uinput` or `uhid`)                      | the unchanged shipped binary: all of C, plus SDL's Linux backend and the kernel's HID parsing | Linux with `/dev/uinput` or `/dev/uhid` only | no, real time only             |

### The spike

A throwaway crate (kept outside the repo, in the project's files as `gcs-86-virtual-radio/spike/`) built against PR #68's head, now on master, tested C in two modes, on Linux in a cloud container:

- **Virtual clock.** It attaches a virtual joystick from a recording's header, applies each recorded change, calls SDL's update, and takes the station's own `input::snapshot` every 20 ms of recording time without sleeping. It copies `input::run`'s event handling rather than running it, and leaves out unplugging. A synthetic 4 s session (752 changes: a throttle ramp at 250 changes a second, a roll sweep, switch SF on and off) gave 201 snapshots. At every tick, the values equal the recording folded up to that instant with no SDL involved, and two runs produced byte-identical page protocol output. Dropping the button changes from the player failed the check at `t=1000`, the instant SF flips.
- **Real time, through the station's own loop.** The unchanged `input::run` ran on the main thread while a second thread waited a fixed 300 ms for it to start SDL, attached the virtual radio and played the same recording at its recorded times. The station printed `opened [1] TX16SMK3 Joystick  1209:4f54  (EdgeTX radio)`, published 104 snapshots, ended on exactly the recording's final state, and reported 373 events a second for the busiest second, against 375 recorded.

One limit showed: SDL's virtual joystick sends one event per changed input per update, so on the virtual clock the changes inside one 20 ms tick merge, and `eventsPerSecond` counts ticks, not the radio (218 events reached the station from 752 changes). Values are exact; only the rate differs. Real-time replay keeps the rate.

The spike's recording has no unplug, and it was synthetic: nothing has yet recorded the real radio.

Neither D variant could be tried: the container has no `/dev/uinput`. The repo has no CI that runs tests today (`.github/workflows/` holds only `auto-merge.yml`), so "CI-friendly" is a property to keep, not one anything checks yet.

## Goals

1. **Build C, and only C, now.** _(Worker.)_ It runs the station's radio side as the real radio does, except SDL's platform backend, on the owner's Mac and in any future CI alike. To be deterministic and still run the station's own loop, ticket 1 gives `input::run` a seam: the clock it ticks on, and a hook called once SDL is up, where a test or the replay binary attaches the player. The spike had neither, so it copied the loop for the virtual clock and slept before attaching in real time. A and B run less of the station and save nothing, since C needs no hardware either. D adds only SDL's Linux backend and the kernel, which the owner's Mac does not use: the station's target today is macOS, where the radio comes through IOKit, which no virtual device here reaches.
2. **One recording format, shared with the page protocol.** _(Worker.)_ JSON Lines, so a recording diffs and greps. The first line is a header whose `radio` is page protocol 0's `radio` object, word for word (`name`, `vendorId`, `productId`, `serial`, `axes`, `buttons`, `hats`), holding every value after SDL's first update once the radio is open. Each later line is one input change:

   ```jsonl
   {"format":"gcscode-radio-recording","version":0,"radio":{"name":"TX16SMK3 Joystick","vendorId":4617,"productId":20308,"serial":null,"axes":[0,0,-32768,0,0,0,0,0],"buttons":[false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],"hats":[0]}}
   {"t":4000,"axis":2,"value":-32637}
   {"t":1000000,"button":7,"pressed":true}
   {"t":2500000,"hat":0,"value":3}
   {"t":3000000,"unplugged":true}
   {"t":3400000,"plugged":{"name":"TX16SMK3 Joystick","vendorId":4617,"productId":20308,"serial":null,"axes":[0,0,12000,0,0,0,0,0],"buttons":[false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],"hats":[0]}}
   ```

   `t` is microseconds since recording started: the radio reports about once a millisecond while a stick moves, so milliseconds (which the spike used) would stack changes. Lines are in recording order, and lines with the same `t` keep it. `unplugged` is the radio leaving. `plugged` is it coming back, and carries a whole `radio` object read after SDL's first update, because a radio can come back with a stick held deflected.

   The recorder writes changes by comparing every value with the last it wrote, after each batch of SDL events, not from events alone. SDL 3.4.20 posts no event for a real joystick's first axis values after it opens (`SDL_SendJoystickAxis` in `src/joystick/SDL_joystick.c` waits for "real activity on this axis", and skips that only for virtual joysticks), so an event-only recorder would miss a stick held deflected through a replug, the case GCS-43 is about. Replaying the header alone gives exactly the page protocol's `radio` at time 0, and folding the changes up to any `t` gives it at that instant, so a recording is also the expected answer for every test that replays it.

3. **The recorder lives in `radio-probe`.** _(Worker.)_ `radio-probe --record <file>` writes a recording of the radio it opened, from opening it until Ctrl-C, while showing the usual live block. It is the tool already used to check a radio. It always writes `serial: null`: recordings are committed to a public repo, the probe README already keeps a real serial out of it, and SDL's `SDL_VirtualJoystickDesc` has no serial field, so a recorded serial could not be replayed anyway.
4. **The player is a library module beside the radio reading** _(Worker.)_ (`radio_probe::replay` while the station builds on `radio-probe`'s crate), with two ways to play: on a virtual clock, where the caller decides when each tick happens (for tests), and in real time on a thread of its own (for end-to-end runs). It attaches a virtual joystick from the header with the radio's USB ID, and detaches and reattaches it for `unplugged` and `plugged`.
5. **Recordings live in `tools/radio-probe/recordings/`** _(Worker.)_, named `<what-it-does>.jsonl` (`adv-sweep.jsonl`, `adv-replug-deflected.jsonl`), each with a line in that folder's README saying what the owner did while recording it, on which EdgeTX version and in which joystick mode. Each is cut to one purpose and kept under about 1 MB (some 30 s at the radio's busiest rate of about 1,000 changes a second, at 30 bytes a line).
6. **A replayed radio keeps the radio's identity; the replay is marked outside it.** _(Worker.)_ The player gives its virtual joystick the recorded name and USB ID exactly, so the station serves the folded recording unchanged and the mapping layer (GCS-40, which matches a profile by USB ID and name) maps a replay as it maps the radio. What marks a replay is the binary that plays it: `gcscode-station-replay` prints that it is replaying, and which file, when it starts and when a page connects. Whether the page shows it too, by a field in page protocol `hello`, is ticket 2's decision.
7. **Replay can never reach the shipped station.** _(Worker.)_ The station will send manual control to vehicles (GCS-41 onward). A station that can be told to invent stick input is a hazard on a real vehicle, so replay in the station is a separate binary, `gcscode-station-replay`, built only with a cargo feature (`required-features = ["replay"]`) that the normal build and `pnpm --filter mavlink-station start` leave out. The package then sets `default-run = "gcscode-station"`, since `cargo run` refuses a package with two binaries otherwise, even when one's required features are off.

## Non-goals

- **D, a kernel virtual device.** It is the only way to test the unchanged shipped binary reading a replay, SDL's Linux joystick backend, and the kernel's reading of the TX16S's HID descriptor. If it is built, `uhid` beats `uinput`: `uhid` replays the radio's own HID report descriptor and reports, so the kernel parses them as it parses the real radio, while `uinput` creates an already-parsed input device with axes the tool declares. _Trigger:_ gcscode's station runs on Linux for real, or CI gains an end-to-end job on a Linux runner that offers `/dev/uhid`.
- **Option 3, other gamepads, as a tool of its own.** SDL's virtual joystick can present a gamepad (its descriptor has a `type`, including `SDL_JOYSTICK_TYPE_GAMEPAD`), so once the mapping layer reads more than one kind of controller, another controller is a recording from that controller plus the same player, not a new tool. _Trigger:_ the mapping layer (GCS-40 or after) handles a second kind of controller.
- **A, a fake station for page tests.** The page's own tests already use a fake socket ([`test-fakes.ts`](../../packages/extension-manual-control/src/test-fakes.ts)). A TypeScript reader of the same format can come when a page test or a Playwright run needs more than a few hand-written messages.
- **Recording the page protocol's output** instead of SDL's input. It is a 20 ms sample, so it loses changes and the event rate, and it can be derived from an SDL recording but not the other way round.
- **Reaching gcscode other than as the radio does.** Replay enters below the station's radio side, at SDL, where a plugged-in radio does, though in the station's own process (Context). Nothing here adds a message to the page protocol or a path into the page.
- **Replacing the real radio in smoke tests.** [`docs/smoke-tests.md`](../smoke-tests.md) runs every smoke test with a real radio. A replay adds a repeatable regression check beside a rung's smoke test, such as GCS-43's replug with the sticks deflected; it does not replace the radio there.

## VS Code alignment

Nothing here touches the extension API or the host↔extension boundary: the recorder, the player and the replay binary are a tool and a station test harness. No rows for `docs/vs-code-alignment.md`.

## Proposed tickets

Each in the Manual control project, in this order:

1. **Record a TX16S session and replay it through the station** (proof tool). The recorder, the format above, the player on a virtual clock, `input::run`'s seam (Goal 1), and the first two recordings from the owner's TX16S on his Advanced `gcscode-adv` model ([tx16s-advanced-model.md](../../tools/radio-probe/tx16s-advanced-model.md)), which GCS-40 maps: every stick to both ends and every switch through each position, and an unplug and replug with a stick held deflected. A station test drives `input::run` itself over both and checks every snapshot against the recording folded to that tick. _Depends:_ the owner's answer to ADR-0015's open question (below); GCS-38 has shipped. _Done when:_ the test fails when the player drops a change or a `plugged` line's values, and the owner's recording replays on his Mac and in the cloud container alike.
2. **Replay a recording through the running station** for end-to-end runs: real-time play through the seam, with no sleep, and `gcscode-station-replay` behind its cargo feature. It starts with the first of GCS-42, GCS-43 and GCS-44 to be picked up, all of which come after GCS-41 and send from mapped controls, so their checks can repeat without a hand on the sticks. _Depends:_ ticket 1 and GCS-41. _Done when:_ the Radio input view shows a recording playing while the replay binary says it is replaying, and the normal station build and `pnpm --filter mavlink-station start` cannot replay.

### The owner's question ticket 1 waits on

[ADR-0015](../decisions/ADR-0015-native-sidecars.md) leaves to the owner (PR #75 RT-8) whether a native process may build on a tool's Rust crate, as the station builds on `radio-probe`, while `CLAUDE.md` says gcscode reaches `tools/` only over the protocols a real system uses. Replay deepens that dependency: the player has to be linked into a station build. If the answer is yes, Goals 3 to 5 stand as written. If it is no, the radio reading and the player move to a library in `libs/` that knows nothing of gcscode, the recorder stays in `radio-probe` and uses that library, and the recordings move beside the station's tests in `packages/mavlink-station/tests/recordings/`; the format is unchanged either way.

## `docs/out-of-scope.md` propagation

None. Both deferrals are tool scope, not architecture, and the roadmap entry carries them with their triggers.

## `docs/roadmap.md` propagation

When ticket 1 ships, the Virtual radio and gamepads entry becomes: options (1) and (2) settled as C, built in that ticket and ticket 2; `uhid` and other gamepads deferred with the triggers above. Until then the entry links this spec.

## Known unknowns

- **macOS virtual joystick under the station's hints.** The spike ran on Linux. SDL builds its virtual joystick driver on macOS too, and `radio-probe`'s virtual-joystick test is the one to run there, but nothing has checked it beside `SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS` with the real radio also plugged in. Ticket 1 checks it.
- **Two radios at once.** With the real TX16S plugged in, `Probe` opens whichever EdgeTX joystick SDL announces first and ignores the second, so a replay beside a real radio may be ignored, or worse, shadow it. Ticket 2 decides whether the replay binary refuses to start while a real EdgeTX radio is present.
- **What a replay binary may send to.** Goal 7 keeps replay out of the shipped station, but `gcscode-station-replay` will send whatever the station sends once GCS-41 lands. Whether it must refuse any vehicle that is not SITL, and how it would tell, is GCS-41's question; GCS-41 carries it as a comment on its ticket.
- **Classic joystick mode.** Ticket 1 records the Advanced model, which reports 28 buttons. The format carries the counts in its header, so Classic mode needs no change to it, only recordings of its own if a test ever needs Classic.
- **What a recording pins.** A committed recording fixes a rung's input, not what its smoke test reads: when a later rung rebuilds a view, that view's expected lines change anyway. Only a check of the station's own output against the folded recording stays a rung's own as the views change. Whether smoke tests that check older rungs should replay their recordings, so a rerun checks that rung's input path while its view moves on, is for `docs/smoke-tests.md`, not this spec.
