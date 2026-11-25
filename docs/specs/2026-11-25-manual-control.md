# Manual control through the station

The TX16S's mapped sticks reach a SITL vehicle as MAVLink `MANUAL_CONTROL` frames that the station process sends, addressed to the one vehicle the operator named, while the radio's held control switch is on. This is the amendment Linear GCS-39 asks for: it rewrites the unmerged manual control v0 draft (`spec/manual-control-v0`, `docs/specs/2026-11-22-manual-control-v0.md` on that branch) to [ADR-0016](../decisions/ADR-0016-one-station-process.md)'s one station process and to GCS-40's mapping profile, and splits it into the Manual control lane's rungs.

Decisions are marked _(Owner.)_ or _(Worker.)_. The worker is the session that wrote this on 2026-11-25 while the owner was away. Each _(Worker.)_ decision is a default the owner can overturn in review.

## Context

### What changed since the v0 draft

The v0 draft gave manual control a sidecar of its own, `packages/manual-control-sidecar`, which read the radio, picked the first autopilot it heard and sent `RC_CHANNELS_OVERRIDE` and a heartbeat as system 255. Three things have since replaced parts of it:

- **[ADR-0016](../decisions/ADR-0016-one-station-process.md).** One station process sends everything gcscode sends to a vehicle, with one MAVLink identity and one heartbeat, and it is the only place a target vehicle is chosen (Decisions 1, 3). Manual control is a part of that process, with its own thread and fixed deadlines, not a process of its own (Decision 4). The draft's sidecar, its heartbeat and "the first autopilot heard" all go.
- **The station exists.** `packages/mavlink-station` (`gcscode-station`, GCS-38 and GCS-29) reads the radio with [`libs/radio-input`](../../libs/radio-input/README.md), takes a snapshot every 20 ms on its radio side, which owns SDL, and serves it to the page on `ws://127.0.0.1:8091/ws` ([README](../../packages/mavlink-station/README.md)). It sends nothing to any vehicle yet.
- **The mapping layer (GCS-40, PR #82).** A profile, such as the bundled [`gcscode-adv.toml`](../../libs/radio-input/profiles/gcscode-adv.toml), names what each input means: axis roles `roll`, `pitch`, `throttle`, `yaw` and `aux1` to `aux4`, each calibrated; on/off roles `control` and `rtl`, which may map only to a held button; and Pulse switches with named positions. The draft's fixed Classic channel table goes, and with it the draft's "channel 16 is the control switch": the control switch is the profile's `control` role.

### What ArduPilot does with `MANUAL_CONTROL`

From ArduPilot's master source, read on 2026-11-25 (`libraries/GCS_MAVLink/GCS_Common.cpp`, `ArduCopter/GCS_MAVLink_Copter.cpp`, `libraries/AP_Arming/AP_Arming.cpp`):

- It takes a `MANUAL_CONTROL` only from a system id it counts as its GCS (`sysid_is_gcs`, the `MAV_GCS_SYSID` range, 255 by default) and only when the frame's `target` is its own system id. Anything else is dropped without a word.
- Copter maps four axes onto its roll, pitch, throttle and yaw channels, which follow `RCMAP_*`: `y` to roll and `r` to yaw over -1000 to 1000, `x` to pitch, reversed, over -1000 to 1000, and `z` to throttle over 0 to 1000. A negative `z` drops the whole frame. Each axis is scaled into that channel's own `RCn_MIN` to `RCn_MAX`, so the vehicle's RC calibration applies, not the radio's PWM. `INT16_MAX` in an axis releases it. Buttons and the extension axes are ignored by Copter.
- Each axis becomes an RC override, which holds until `RC_OVERRIDE_TIME` (3 s by default) passes with no new one, then lapses to the vehicle's receiver, or, with none, to its RC failsafe.
- A `MANUAL_CONTROL` also counts as a heartbeat from the GCS for the GCS failsafe.
- Copter arms on right yaw with the throttle at zero, and disarms on left yaw, held about two seconds (`ARMING_RUDDER`, arm or disarm by default on Copter). An override is held for 3 s, so a single frame in that pose can arm a vehicle.

### The lane's rungs

The Manual control project in Linear climbs: GCS-41, one control frame to a disarmed SITL seen on the wire; GCS-42, a fixed-rate stream, rate and jitter measured; GCS-43, unplugging and replugging the radio never makes the vehicle jump; GCS-44, flying one SITL vehicle by hand in Loiter. GCS-96 replays a recording through the running station so those checks can repeat without a hand on the sticks. Before GCS-41 can start, the station must heartbeat (GCS-30), which needs its system id (GCS-28), and GCS-40 must pass its smoke test. The steady core's criteria the tickets name (M1 to M7, F5) are the owner's, kept outside this repo; this spec cites them by id and leaves their numbers there.

## Goals

1. **`MANUAL_CONTROL`, not `RC_CHANNELS_OVERRIDE`.** _(Worker.)_ The station sends the four sticks as `MANUAL_CONTROL`'s `x`, `y`, `z` and `r`, and nothing else. See [the decision](#decision-manual_control-not-rc_channels_override).
2. **A frame is built from the mapped controls, never from raw axes.** `y` is roll, `x` pitch, `z` throttle and `r` yaw, each the mapper's calibrated value scaled to the frame's range and rounded: -100% gives -1000, 0% gives 0 and 100% gives 1000, and throttle's 0% to 100% gives 0 to 1000. The station scales the mapper's unrounded value, not the whole `percent` the page shows, so a frame keeps the stick's full resolution. `buttons` is 0. A profile that leaves out any of the four sticks never takes control, and the station says so when it opens the radio.
3. **One named target.** _(Worker.)_ The station sends control frames to one vehicle, named by its MAVLink system id with `--control-vehicle <id>`, which `pnpm dev:sitl` passes through. With no `--control-vehicle`, the station sends no control frame and says so once at start. It addresses a frame only to that id, and only while that vehicle is heard: a `HEARTBEAT` from it with an autopilot other than `MAV_AUTOPILOT_INVALID` in the last 3 s, on the station's own MAVLink link, which GCS-30 brings. Choosing the target from the page is a rung of its own, before GCS-44 ([rungs](#rungs)).
4. **The control switch is the profile's `control` role, and it never takes control by surprise.** Control has three states, Off, Waiting and On, carried over from the v0 draft:
   - **Off**: the switch is off, no radio is open, no profile maps it, the target is not heard or none is named.
   - **Waiting**: the switch is on, but has not been seen off since the station started, the radio was opened or the target was heard again.
   - **On**: the switch went from off to on with the radio mapped and the target heard.

   Turning the switch off always leads to Off, and from Off only the switch moving to on leads to On. Each event in this list is a test case. The station prints each change of state on its terminal (`control: on, vehicle 1`).

5. **When the radio vanishes, the station stops sending, and nothing else.** _(Worker.)_ It sends no neutral frame and no release, and control goes to Off within one control tick (40 ms). The vehicle then holds the last frame until `RC_OVERRIDE_TIME` lapses, and its own RC failsafe or receiver takes over. See [the decision](#decision-a-vanished-radio-stops-the-frames). The same holds on SIGINT, SIGTERM and a panic, which aborts the process (`panic = "abort"`).
6. **No frame in ArduPilot's stick arming pose, until GCS-44 decides arming.** _(Worker.)_ The station sends no frame whose throttle is under 5% while yaw is beyond ±50%, and prints why (`control: not sent, throttle low with yaw at 82% arms or disarms ArduPilot`). GCS-41 to GCS-43 run against a disarmed vehicle that must stay disarmed; with a 3 s hold, one frame in that pose would arm it. GCS-44 keeps, narrows or lifts this when it decides how the operator arms.
7. **The page is not on the path, and its state changes nothing.** _(Worker.)_ Manual control runs from the radio through the station's radio side and its control thread to the vehicle. Closing, freezing, hiding or reloading the page, and disabling the MAVLink or Manual control extension, neither starts nor stops it: the control switch does. This answers ADR-0016's open "when manual control stops" for manual control only; the heartbeat's half stays GCS-30's. The page protocol does not change for GCS-41.
8. **A replay build sends control frames only to a vehicle it has shown is SITL.** _(Worker.)_ This settles the question GCS-41 carries from the [virtual radio spec](2026-11-24-virtual-radio.md#known-unknowns). See [the decision](#decision-a-replay-build-refuses-a-vehicle-it-cannot-show-is-sitl).

## Non-goals

- **A real vehicle.** Until a failsafe rung, manual control is for SITL. The station's README and every view that shows control say "SITL only". Only a replay build checks it (Goal 8); the shipped build trusts the operator, as the v0 draft did.
- **The aux axes, the switches and `rtl`.** Flight modes and actions are commands, which the commands lane brings (GCS-48 first). The radio's other inputs reach the page as today and go nowhere else. GCS-44 changes mode by MAVProxy's console until a command rung lands.
- **Gamepads and other radios.** `MANUAL_CONTROL` suits them (Goal 1), and they join when the mapping layer reads a second kind of controller.
- **Choosing the target from the page, and two pages.** The page sends the station nothing, so the open questions of how the page names a vehicle and what two pages at once do ([ADR-0016](../decisions/ADR-0016-one-station-process.md#consequences)) stay with the rung that first lets the page choose.
- **The station's system id, its heartbeat and its MAVLink link.** GCS-28 and GCS-30. This spec only needs that id to be one the vehicle counts as its GCS.
- **Windows and Linux timing.** The control thread's timing protection is macOS's first, as in the v0 draft (`NSActivityLatencyCritical`); other platforms log that they have none.

## Design

### Where it lives

Manual control is a part of `packages/mavlink-station`, as ADR-0016 Decision 4 says. It has three pieces, and only the last knows MAVLink:

- **The radio side**, as today: it owns SDL, drains SDL's events, and every 20 ms publishes a snapshot holding the raw inputs and the mapped controls. The snapshot gains the mapper's unrounded stick values next to `percent`.
- **`control`**: the Off, Waiting and On state machine of Goal 4, the arming pose of Goal 6, and the four stick values, in the profile's words. It knows no protocol.
- **The MAVLink link**, which GCS-30 brings for the heartbeat: it knows which vehicles it hears and builds and sends `MANUAL_CONTROL`.

### The control thread

The control thread is plain blocking code with no async runtime. It wakes on fixed deadlines, each 40 ms after the last deadline rather than after the last wake-up, so it does not drift, and it never waits on the page side. At each deadline it reads the newest snapshot and moves the state machine. Missed deadlines are skipped, never sent as a burst. The radio counts as lost when no radio is open, when the newest snapshot is more than 250 ms old (a stalled radio side) and when the thread wakes more than 250 ms after its deadline (a frozen or starved process), so a station that resumes after a freeze comes back in Waiting, not On. The 25 Hz rate is this spec's; GCS-42 measures it against M1 and M2.

What leaves on each tick, by rung:

- **GCS-41:** one frame on each move from Waiting or Off into On, and none on the ticks after it. A disarmed vehicle holds it for 3 s and lets it lapse.
- **GCS-42 on:** one frame on every tick while On, none otherwise.

### Frames the station never sends

- **Re-centred sticks from a vanishing radio.** When a joystick is removed, SDL re-centres every input just before it reports the removal (`SDL_PrivateJoystickForceRecentering`, SDL 3.4.20), and both arrive in the same update. The radio side drains every queued event before it takes a snapshot, so no snapshot holds the re-centred values with the radio still open, and the radio side drops the mapper on removal. A replay test pins this: a recording that ends with the radio detached never yields a snapshot with the radio open and every axis at its opening value after the last recorded change.
- **A frame to a system id other than the target**, or to system 0.
- **A frame in the arming pose** (Goal 6).

### Decision: `MANUAL_CONTROL`, not `RC_CHANNELS_OVERRIDE`

The v0 draft chose `RC_CHANNELS_OVERRIDE` because the radio delivered channels and its switches mattered as much as its sticks, and with no mapping layer the vehicle's channel settings gave them meaning. The mapping layer reverses both reasons. The station now knows roll, pitch, throttle and yaw by name, calibrated, so `MANUAL_CONTROL`'s four named axes say exactly that, and ArduPilot scales them into its own channel calibration and `RCMAP`, so nothing about the vehicle's RC setup leaks into the station. The switches become commands, which name what they do (Non-goals), instead of PWM on a channel whose meaning lives in the vehicle's parameters. `MANUAL_CONTROL` is also what a gamepad sends, so the second kind of controller needs no second message.

What it costs: a `MANUAL_CONTROL` cannot release a channel, as `RC_CHANNELS_OVERRIDE`'s 0 can, so stopping always means a hold of up to `RC_OVERRIDE_TIME` (the next decision); and the radio's switches do nothing in gcscode until a command rung lands. Revisit if a rung needs a channel `MANUAL_CONTROL` lacks, such as a gimbal axis.

### Decision: a vanished radio stops the frames

GCS-95 left this to GCS-41: when the radio disappears mid-control, does the station stop sending, send a final neutral frame, or hand over to the vehicle's own failsafe, and how fast? The station stops sending within one tick and sends nothing more. A neutral frame is not safe: a centred throttle holds height in Loiter or AltHold but not in Stabilize, and the station does not know the mode's class yet ([ADR-0018](../decisions/ADR-0018-vehicle-classes-as-selectors.md)). A release would need `RC_CHANNELS_OVERRIDE` (previous decision). A mode change is a command, which no rung sends yet.

So the vehicle holds the last frame until `RC_OVERRIDE_TIME` lapses, 3 s by default, then its receiver or its RC failsafe takes over: the vehicle's own failsafe, which is what GCS-43 asks for. The operator shortens the hold with `RC_OVERRIDE_TIME`; the station does not change the vehicle's parameters. GCS-43 measures what SITL does in that hold and after it, and revisits this decision if the hold is not acceptable.

### Decision: a replay build refuses a vehicle it cannot show is SITL

The [virtual radio spec](2026-11-24-virtual-radio.md#known-unknowns) left this to GCS-41: `gcscode-station-replay` (GCS-96) sends whatever the station sends, driven by a recording instead of a hand. It must refuse any vehicle it has not shown to be SITL. A recording replayed at a real vehicle flies it blind, with nobody's hand on the sticks.

The tell is a parameter only the simulator has: ArduPilot builds its `SIM_` parameters only when the simulator is compiled in (`AP_SIM_ENABLED`, which SITL turns on). The replay build reads `SIM_SPEEDUP` from the target with `PARAM_REQUEST_READ` before its first control frame to it, and sends control frames only once a `PARAM_VALUE` for it has come back from that system id. It sends none to a vehicle that answers with an error or does not answer within 3 s, and prints why. Other tells were weighed and set aside: the link's address (MAVProxy on localhost can forward a real vehicle), the heartbeat (it does not say SITL) and `AUTOPILOT_VERSION` (it names the board, and needs a request too).

Reading a parameter is the station's first request to a vehicle, so it belongs to a rung of its own: the replay build sends no control frame at all until that rung lands. GCS-96's _Done when_ needs no frame: it shows a replay in the Radio input view and keeps the replay off a real radio. The shipped build makes no such check (Non-goals).

### Rungs

What each rung of the lane takes from this spec:

| Rung                                              | Takes                                                                                  | Proof                                                                                                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GCS-41, one frame                                 | Goals 1 to 7; one frame per move into On; `--control-vehicle`                          | `pnpm dev:sitl --vehicles 2 --control-vehicle 1` and the wire probe: one `MANUAL_CONTROL` to system 1 per switch-on, none to system 2, none while Off or Waiting, and vehicle 1 disarmed throughout |
| GCS-42, the stream                                | a frame every 40 ms while On                                                           | the wire probe's gaps with the page hidden, throttled and closed, against M1 and M2                                                                                                                 |
| GCS-43, unplug and replug                         | Goal 5 measured; a replug with the switch on stays Waiting                             | what SITL does during the hold, read from its telemetry, and no frame until off then on                                                                                                             |
| Read `SIM_SPEEDUP` before replayed frames (new)   | Goal 8's tell                                                                          | the replay build against SITL sends frames; against a fake vehicle without the parameter it sends none                                                                                              |
| Choose the controlled vehicle from the page (new) | the page names the target; ADR-0016's open questions on naming a vehicle and two pages | proposed with its own spec, before GCS-44                                                                                                                                                           |
| GCS-44, fly by hand                               | how the operator arms, and Goal 6 kept, narrowed or lifted                             | a Loiter flight by hand, against M4 and F5                                                                                                                                                          |

The two new rungs go to Backlog when this spec merges. Every rung that sends is a `safety` rung.

### Proof views

GCS-41 adds no page view. Its proof is the wire probe (`tools/wire-probe`), which already shows `MANUAL_CONTROL` and the system its `target` names, plus the station's own terminal lines. The Radio input and Controls views stay as they are. A later rung that shows control in the page adds a panel of its own.

### In the dev stack

`scripts/dev-stack.mjs` passes `--control-vehicle <id>` through to the station. The dev stack gives no default, so `pnpm dev:sitl` alone never sends a control frame.

## Validation

### Automated

Rust, each with an absolute expected value:

- **Scaling.** Roll at -100%, -50%, 0%, 50% and 100% gives `y` -1000, -500, 0, 500 and 1000; pitch the same into `x`; yaw into `r`; throttle at 0%, 50% and 100% gives `z` 0, 500 and 1000. A raw value between two whole percents gives the unrounded scaling, not the rounded percent's.
- **A profile missing a stick** never leaves Off.
- **The state machine**, one test per event in Goal 4: starting with the switch on (Waiting), off then on (On), the radio lost while On (Off within one tick), the radio back with the switch on (Waiting), the target not heard for 3 s (Off), no `--control-vehicle` (Off).
- **The control thread** on a fake clock: 25 deadlines a second with no drift; a snapshot older than 250 ms, and a 1 s freeze, each end in Waiting with no burst of missed ticks; GCS-41's one frame per move into On.
- **The arming pose**: throttle 4% with yaw 51% sends nothing; throttle 6% with yaw 100% sends; throttle 0% with yaw 49% sends.
- **The frame**: message 69, the target's system id in `target`, the station's own system id as sender, `buttons` 0.
- **A vanishing radio**, replayed from a recording that ends detached: no snapshot with the radio open holds the re-centred values.

### Live, recorded in each rung's PR

The rungs table's proof column. GCS-41's runs on the committed TX16S recordings (`packages/mavlink-station/tests/recordings`) replayed in a test, and on the real radio for its smoke test.

## VS Code alignment

| Concern                              | VS Code                                                                                       | gcscode                                                                                                            | Status                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Binding inputs to what they do       | `keybindings.json`: `{ key, command, when }`, user entries over defaults                      | A radio profile binds axes to stick roles and a held button to `control`; the station turns the sticks into frames | Divergence, decided in GCS-40 and kept here: sticks are continuous, not commands. Trigger to revisit: the first switch bound to a command |
| A job's lifetime and its extension's | Disabling an extension deactivates it and stops what it started, its language server included | Disabling the MAVLink or Manual control extension does not stop manual control; the control switch does (Goal 7)   | Divergence, decided here: the page cannot stop the station, and a stick path must not depend on the page                                  |
| Work outside the UI process          | A language server runs as its own process, and an extension is its client                     | Manual control runs in the station process, the MAVLink extension's native half                                    | Alignment, decided in [ADR-0016](../decisions/ADR-0016-one-station-process.md)                                                            |

## `docs/out-of-scope.md` propagation

When GCS-41 ships, add under GCS features:

- **Manual control of a real vehicle.** Manual control is for SITL until a failsafe rung: a vanished radio leaves the vehicle on a 3 s hold, and nothing yet checks the link. _Trigger to revisit:_ the owner wants to fly a real vehicle through gcscode. Source: this spec's Non-goals.

## `docs/roadmap.md` propagation

On merge of this spec, N13 ("Manual control off the page") links this spec, and the roadmap's mention of the v0 draft, if any, points here instead.

## Known unknowns

- **ArduPilot's arming pose thresholds.** Goal 6's 5% throttle and ±50% yaw are wider than ArduPilot's own rule (throttle at zero within its deadzone, yaw near full), on purpose. GCS-41's live run checks that a disarmed SITL stays disarmed with the switch flipped in every stick pose the recordings hold.
- **That MAVProxy carries the station's frames to the vehicle and to the wire probe.** The probe listens on UDP 14552, fed by MAVProxy's outputs. Whether a frame the station sends reaches the vehicle, and shows on the probe, depends on the link GCS-30 builds for the heartbeat, which settles it first.
- **That `MANUAL_CONTROL` lands on SITL's channels as the source says.** GCS-41 is seen on the wire only. GCS-42 reads `RC_CHANNELS` from SITL during a stream and checks roll at 100% puts channel 1 at `RC1_MAX`, and pitch at 100% puts channel 2 at `RC2_MIN`.
- **The sign of the profile's pitch.** Goal 2 sends pitch at 100% as `x` 1000, which MAVLink reads as forward. Whether `gcscode-adv`'s pitch reads 100% with the stick forward is checked against the radio in GCS-41's smoke test; if it reads 100% with the stick back, the profile, not the frame, is fixed.
- **The station's system id must be one the vehicle counts as its GCS.** Otherwise ArduPilot drops every frame without a word. GCS-28 picks the id; if it is not 255, the dev stack sets `MAV_GCS_SYSID` to match, or GCS-41 shows frames on the wire that the vehicle ignores.
- **`SIM_` parameters outside SITL.** ArduPilot can build its simulator into flight hardware for testing; such a board would pass Goal 8's tell. It simulates its own flight, so this is accepted. The rung that reads `SIM_SPEEDUP` checks that a non-SITL ArduPilot build has no such parameter.
- **The hold after a vanished radio.** What SITL does in the 3 s hold and after it, with SITL's simulated receiver behind it, is GCS-43's to record.

## Origin

GCS-39, written 2026-11-25 overnight from the owner's request to climb towards flying SITL with the TX16S. It carries the v0 draft's control states, its control thread's fixed deadlines and its freeze rule, and settles the two questions parked on GCS-41: the vanished radio (from GCS-95, PR #109) and the replay build's targets (from PR #80).
