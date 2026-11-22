# Manual control v0

**Date:** 2026-11-22
**Status:** Draft

A RadioMaster TX16S MK3 flies SITL through gcscode. A native sidecar reads the radio over USB and sends its channels to the vehicle as MAVLink, and a Controller panel in gcscode shows what the sidecar sees and sends. The page watches; it is never on the path from a stick to the vehicle.

## Context

The owner bought a TX16S MK3 and wants manual control in gcscode. Their work GCS reads its controller with the browser's Gamepad API, which exists only on the main thread, and it is unreliable under UI load. [ADR-0015](../decisions/ADR-0015-native-sidecars.md) moves this kind of work into a native sidecar, written in Rust, that acts on its own while the page watches. This spec is that ADR's first sidecar.

What the radio offers, from EdgeTX's source and manual (research on 2026-11-22):

- **USB is one mode at a time.** On plug-in the radio is a joystick, a serial port or a USB drive, never two at once. v0 uses the joystick.
- **The joystick reports channels, not sticks.** Each HID report carries the model's mixer outputs, so the radio's model decides what each channel means. In the default Classic mode, channels 1–8 are analog axes and channels 9–32 are buttons, on when the channel is above zero.
- **It can be recognised.** Every EdgeTX radio's joystick has USB vendor:product `1209:4F54`. On the MK3 the USB serial number comes from the chip's unique ID, so two radios can be told apart.

What ArduPilot accepts, from its current source:

- Only senders whose system ID is in `MAV_GCS_SYSID`..`MAV_GCS_SYSID_HI` may override RC. The default is 255 alone.
- Copter takes only four axes from `MANUAL_CONTROL` and ignores its buttons. `RC_CHANNELS_OVERRIDE` carries any channel up to 18 and is treated as RC input, so ArduPilot's own channel settings (`RCMAP_*`, `RCx_OPTION`, `FLTMODE_CH`) apply to it as they do to a receiver. In channels 1–8, 0 releases a channel and 65535 leaves it unchanged; in channels 9–18, 0 or 65535 leaves it unchanged and 65534 releases it.
- An override lapses `RC_OVERRIDE_TIME` (3 s) after the last packet. The channel then falls back to the receiver, if there is one. GCS failsafe (`FS_GCS_ENABLE`) is off by default.
- SITL's copter defaults calibrate every channel to 1000–2000 µs.

Where it plugs in: MAVProxy fans SITL's MAVLink out over UDP, to 14550 for the Python client and 14551 for mavlink2rest ([`tools/sitl/README.md`](../../tools/sitl/README.md)). An output also carries traffic back to the vehicle. mavlink2rest identifies as system 255, component 0.

**The demo that proves v0:** with `pnpm dev:sitl` running, the owner flips the radio's control switch, arms with the sticks, takes off in Loiter, flies around while the drone moves on the map, and switches to RTL from a radio switch. Then they freeze the gcscode tab and the drone still answers the sticks.

## Why not bigger

The brainstorm settled the larger shape:

1. **Through gcscode, not the radio's own link.** The MK3's internal ExpressLRS module could fly the drone directly, with gcscode only listening. The owner chose to fly through gcscode: it is what a GCS on a datalink does, and it is the only path that also serves gamepads and several controllers.
2. **One sidecar, not a sidecar and a backend.** gcscode has no backend. The sidecar reads the controllers and also sends MAVLink, and its input half knows nothing about MAVLink, so a later backend can take the MAVLink half.
3. **Four iterations, in this order:** v0 (this spec); talking back to the radio, such as vibrating on a gcscode alert or an auto-RTL; mappings, with actions, recognising controllers, defaults per controller and import/export, where gamepads join; then several controllers and the gimbal. A failsafe iteration comes before any real vehicle.

The owner's intent for the later iterations shapes v0's seams. The TX16S is the power user's controller and generic gamepads are the beginner's, so both must fit. Buttons will carry actions such as "toggle GPS", not only stick and channel input. Windows and Linux are wanted, but the owner runs and tests on a Mac first.

v0 is the smallest cut that flies: the radio's channels straight through, with no mapping layer. The radio's model and ArduPilot's channel settings decide what everything does, as they would over a receiver. So the one action the owner named already works in v0: a switch on a channel whose `RCx_OPTION` is GPS Disable (65).

## Goals

1. A Rust sidecar, `packages/manual-control-sidecar`, that finds the TX16S joystick, reads its channels and, while the operator's control switch is on, sends them to the vehicle as `RC_CHANNELS_OVERRIDE` at 25 Hz.
2. A control switch on the radio decides when gcscode has control. Starting the sidecar, plugging the radio in or finding the vehicle never takes control by itself.
3. A Controller panel in gcscode, `@gcscode/extension-manual-control`, that shows the sidecar's state: the radio, its channels, whether control is on and what is being sent.
4. `pnpm dev:sitl` starts the sidecar, and SITL's MAVProxy gets an output for it.
5. Nothing the page does can delay what the sidecar sends. The live validation freezes the page in flight to prove it.

## Non-goals

- **A real vehicle.** v0 has no link-loss or failsafe design: overrides lapse after 3 s and GCS failsafe is off by default. The sidecar's README says SITL only, and so does the panel. The failsafe iteration lifts this.
- **Gamepads, mappings and actions.** Only the TX16S, and only its channels. Gamepads, `MANUAL_CONTROL`, deadband and expo, profiles, defaults and import/export come with the mappings iteration.
- **Talking back to the radio.** No serial link, Lua or vibration.
- **More than one controller, more than one vehicle, or the gimbal.** The sidecar uses the first EdgeTX joystick and the first autopilot it hears.
- **Windows and Linux.** The sidecar is built and tested on macOS. The platform code sits in one module, so those platforms add their own versions of it later.
- **Configuring the sidecar from the page.** v0's protocol only goes from the sidecar to the page. The page sends nothing.
- **Starting the sidecar outside the dev stack** ([ADR-0015](../decisions/ADR-0015-native-sidecars.md) Decision 6).

## Anti-goals

- **The page on the command path.** If a stick's movement waits on anything the page does, v0 has failed, however well it flies.
- **Taking control by surprise.** A sidecar that starts with the switch already on, or a radio plugged back in mid-flight, must not override the vehicle until the operator moves the switch off and on again.
- **Renaming what the radio and ArduPilot already name.** The panel says "channel 5" and shows µs values. Flight modes and switch functions stay where the operator set them up: in the radio's model and ArduPilot's parameters (see [the work GCS's lesson](../decisions/ADR-0014-protocols-as-languages.md#context)).

## Design

### Packages

- `packages/manual-control-sidecar`: one Rust crate, with a binary named `gcscode-manual-control`, and a `package.json` whose scripts run Cargo, so `pnpm build`, `pnpm test`, `pnpm check` and `pnpm lint` cover it ([ADR-0015](../decisions/ADR-0015-native-sidecars.md) Decision 5). Its `src/` keeps the input half (`input/`), the MAVLink half (`mavlink/`), the page's protocol (`api/`) and the platform code (`platform/`) in separate modules. Nothing in `input/` imports from `mavlink/`.
- `packages/extension-manual-control`: the extension, with id `gcscode.manual-control` and display name "Manual control". It contributes one view and one setting, and exports nothing.

Crates: `sdl3` 0.22 (built from source and linked statically, joystick subsystem only), dropping to `sdl3-sys` for the few calls the safe crate lacks; `mavlink` 0.21 with the `ardupilotmega` dialect; `tokio` and `axum` for the WebSocket; `serde_json`; `objc2` with `objc2-foundation` on macOS; `tracing` for logs. Building SDL from source needs CMake, which the README's setup lists.

### The radio's side: a gcscode model

The README walks the owner through a radio model named `gcscode`:

- USB Joystick in Classic mode.
- Channels 1–4: aileron, elevator, throttle, rudder, which is ArduPilot's default `RCMAP` order.
- Channel 5: flight mode, an analog channel, since `FLTMODE_CH` is 5 by default.
- Channels 6–8: analog, free for the owner.
- Channels 9–15: two-position switches, free for the owner (an RTL switch, GPS Disable).
- Channel 16: the control switch.
- The internal RF module off, so the model never binds a receiver while gcscode flies.

### Inside the sidecar: three threads

1. **The input thread** owns SDL. It initialises the joystick subsystem with the hint `SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS` set to `1`, because the sidecar has no window to be focused. It pumps SDL's events about every 5 ms, and after each pump it publishes a snapshot: the radio's identity, its channels, the control switch, and the time of the pump.
2. **The send thread** wakes on fixed deadlines (each one 40 ms after the last deadline, not after the last wake-up, so it does not drift) and sends the latest snapshot to the vehicle. It is ordinary blocking code with no async runtime.
3. **The tokio runtime** serves the page's WebSocket and reads the same snapshots.

Snapshots are written by one thread and read by two; a reader always gets the newest and never waits behind a writer. The send thread never waits on the runtime, so a slow or frozen page cannot delay it. If the newest snapshot's pump time is more than 250 ms old, the send thread treats the radio as lost: a stalled input thread must not have its last values sent as if they were fresh.

### Reading the radio

The input thread opens the first joystick with vendor:product `1209:4F54`. It ignores other devices and logs a second EdgeTX joystick without opening it. It reads identity (name, vendor and product IDs, serial number) when it opens the radio, and treats unplugging as losing the radio.

Classic mode gives SDL eight axes and 24 buttons. v0 reads them as the radio's channels:

| SDL         | Channel            | Value                                                    |
| ----------- | ------------------ | -------------------------------------------------------- |
| axes 0–7    | 1–8                | `1500 + round(axis × 500 / 32767)`, clamped to 1000–2000 |
| buttons 0–6 | 9–15               | 2000 when pressed, 1000 when not                         |
| button 7    | 16, control switch | on when pressed                                          |

So −32768 gives 1000, 0 gives 1500 and 32767 gives 2000. That SDL numbers EdgeTX's axes in channel order on macOS is the first of the [Known unknowns](#known-unknowns).

### The control switch

Control has three states:

- **Off**: the switch is off, the radio is lost, or no vehicle has been found yet.
- **Waiting**: the switch is on, but has not been seen off since the sidecar started, the radio was last found, or the vehicle was found.
- **On**: the switch went from off to on with the radio and a vehicle present.

Moving the switch to off always leads to Off, and from Off only the switch moving to on leads to On. Losing the radio leads to Off, and finding it again with the switch on leads to Waiting. v0 never loses a vehicle once it has found one ([link health](#what-goes-to-the-vehicle), below). Each event in this list is a test case.

The radio counts as lost when it is unplugged, when the newest snapshot's pump time is more than 250 ms old, and when the send thread wakes more than 250 ms after its deadline, which means the whole process was frozen or starved. Missed deadlines are skipped, never sent as a burst. So a sidecar that resumes after a freeze comes back in Waiting, not On. The 250 ms bound is v0's; the failsafe iteration tunes it.

### What goes to the vehicle

The sidecar listens for MAVLink on UDP `127.0.0.1:14552`, and `tools/sitl/run_sitl.sh` gains a third MAVProxy output to it. It replies to the address it last heard from, so its packets reach the vehicle through MAVProxy.

- **Which vehicle:** the first `HEARTBEAT` whose `autopilot` is not `MAV_AUTOPILOT_INVALID` gives the target system and component. Heartbeats from other systems are logged and ignored.
- **Who it is:** system 255, which ArduPilot accepts by default, and component 190 (`MAV_COMP_ID_MISSIONPLANNER`, the one other GCSs use), so it differs from mavlink2rest's component 0. It sends a `HEARTBEAT` at 1 Hz as `MAV_TYPE_GCS` with `MAV_AUTOPILOT_INVALID`, whether or not control is on.
- **While control is On:** on each 25 Hz tick, one `RC_CHANNELS_OVERRIDE` to the target, with channels 1–15 from the snapshot and channels 16–18 set to 0 (unchanged). The control switch is not forwarded.
- **On leaving On:** for one second of ticks it sends release packets: channels 1–8 at 0, channels 9–15 at 65534, channels 16–18 at 0. Then overrides stop until control is On again. UDP can drop a packet, hence a second of them.
- **Link health:** v0 does not judge it. Once it knows the target it keeps sending to it. Losing the link is the failsafe iteration's.
- **Stopping:** on SIGINT or SIGTERM while overrides or a release burst are going out, the sidecar finishes a one-second release burst, then exits. That fits inside the dev stack's five seconds between SIGTERM and SIGKILL. A panic aborts the whole process (`panic = "abort"`), so the page never sees a sidecar whose send thread has died while its WebSocket still serves the last state.

### The page's view: the sidecar's protocol, version 0

The sidecar serves a WebSocket at `ws://127.0.0.1:8091/ws` and binds `127.0.0.1` only. It refuses an upgrade whose `Origin` header is present and not on its allowlist, which by default holds `http://localhost:5173` and `http://127.0.0.1:5173` (`--allow-origin` adds more). A connection with no `Origin` is allowed, since only a non-browser local process sends none. Version 0 carries nothing the sidecar would act on, but later versions will, so the check starts now.

Messages are JSON objects with a `type`. The sidecar sends `hello` once, then `state` about 15 times a second:

```json
{ "type": "hello", "protocol": 0, "sidecar": "0.1.0" }
```

```json
{
  "type": "state",
  "controller": {
    "name": "TX16SMK3 Joystick",
    "vendorId": 4617,
    "productId": 20308,
    "serial": "…"
  },
  "channels": [
    1500, 1500, 1000, 1500, 1800, 1500, 1500, 1500, 1000, 1000, 1000, 1000, 1000, 1000, 1000
  ],
  "controlSwitch": true,
  "control": "waiting",
  "vehicle": "system 1",
  "sending": false,
  "sentPerSecond": 0
}
```

- `controller` is `null` with no radio, and `channels` and `controlSwitch` are then `null`.
- `controlSwitch` is the switch's position, which `control` alone does not give: switch on with no vehicle yet is still Off.
- `control` is `"off"`, `"waiting"` or `"on"`.
- `vehicle` is a label the sidecar writes, or `null`.
- `sending` is true while overrides or release packets go out.
- `sentPerSecond` counts the packets of the last second.

A client that falls behind gets the newest state and skips the rest. Nothing queues without bound. The page sends nothing in version 0, and the sidecar ignores whatever it receives. A client that sees a `protocol` other than 0 says the sidecar and gcscode do not match.

### The Controller panel

`extension-manual-control` registers the setting `gcscode.manual-control.sidecarUrl` (default `ws://127.0.0.1:8091/ws`, read once in `activate()`, as Video reads its address) and the view `gcscode.manual-control.main`, titled "Controller". The panel connects when it is mounted, retries every two seconds while the sidecar is not there, and shows:

- **No sidecar:** "The manual control sidecar is not running. `pnpm dev:sitl` starts it."
- **No radio:** "No controller. Plug in the TX16S and choose Joystick on the radio."
- **The radio:** its name and serial number, and the three control states in operator words: "Control off", "Turn the control switch off, then on, to take control", "In control of system 1, sending 25 per second".
- **Channels:** 15 bars with their µs values, plus the control switch, labelled as such.
- **A standing line:** "SITL only: no failsafe yet."

It is display only, with no buttons. A malformed message is logged and skipped; nothing in the panel throws.

### macOS timing

At start, `platform/` begins a process activity with `NSActivityUserInitiated` and `NSActivityLatencyCritical` and holds it until exit, so App Nap and timer coalescing leave the 25 Hz loop alone. On other platforms the module logs once that it has no timing protection there yet.

### In the dev stack

`scripts/dev-stack.mjs` gains a `manual-control` service that runs the built binary. It is up when TCP 8091 accepts, and it claims TCP 8091 and UDP 14552. If the binary has not been built, the service fails at once, saying to run `pnpm --filter manual-control-sidecar build`, as the other services name their setup step. `pnpm build` builds it with the rest.

### Decision: channel overrides, not `MANUAL_CONTROL`

`MANUAL_CONTROL` is the gamepad message: four normalised axes, which Copter turns into channels 1–4, with its buttons ignored. The radio already delivers channels, and its switches matter as much as its sticks. `RC_CHANNELS_OVERRIDE` sends all of them, and the vehicle treats them as it would a receiver's, so the same radio model and parameters behave the same over USB as over RF. `MANUAL_CONTROL` arrives with gamepads, which have no channels of their own.

### Decision: the panel knows no vehicle protocol ([ADR-0014](../decisions/ADR-0014-protocols-as-languages.md))

The panel speaks the sidecar's protocol, as Video speaks WHEP. It never sees MAVLink: the vehicle reaches it as a label the sidecar writes. Channels and µs are the radio's vocabulary, not MAVLink's. Inside the sidecar the same split holds: the input half produces channels and a switch, and only the MAVLink half knows what an override is.

## Validation

### Automated

Rust (`cargo test` under `pnpm test`), each with absolute expected values:

- Scaling: −32768, −16384, 0, 16384 and 32767 give 1000, 1250, 1500, 1750 and 2000. Buttons give 1000 and 2000.
- The control switch: one test per event in [the control switch](#the-control-switch), including starting with the switch on (Waiting), a replug with the switch on (Waiting), and off then on (On).
- Override and release packets: the target IDs and every channel value as listed in [what goes to the vehicle](#what-goes-to-the-vehicle), with channel 16 never carrying the control switch.
- The send loop, under a fake clock: 25 deadlines a second with no drift, a release burst one second long, a snapshot older than 250 ms treated as a lost radio, and a one-second freeze followed by Waiting with no burst of missed ticks.
- Stopping: a stop signal while On sends a one-second release burst and then exits.
- The WebSocket's `Origin` check: refused, allowed and absent.
- The `state` message's JSON for a radio present and absent.

The extension (Vitest): the panel's text for each state, a malformed message skipped, and retrying while the sidecar is absent.

### Live, recorded in the feat PR

With `pnpm dev:sitl` and the TX16S on the `gcscode` model:

1. The channel bars follow the sticks and switches, and channels 1–8 come in channel order (or the order SDL reports is recorded and the mapping fixed).
2. The sidecar started with the control switch on shows Waiting and sends nothing. Off then on takes control.
3. Arm with the sticks, take off in Loiter, fly a circuit, switch to RTL, and land. SITL's defaults put Loiter on flight-mode position 5 and RTL on position 3 of channel 5.
4. In flight, pause the gcscode tab's JavaScript in DevTools for 30 s. The drone keeps answering the sticks, and MAVProxy's tlog shows 25 overrides a second throughout.
5. In a hover, turn the control switch off, and record what SITL does. Then, with control on again, freeze the sidecar with `kill -STOP` on its PID, a hung sidecar that sends no release, and record what SITL does over the next ten seconds. After `kill -CONT`, the panel shows Waiting and nothing is sent until the switch goes off and on. A clean stop is a test case rather than a live step, because stopping one service under `pnpm dev:sitl` stops the whole stack.
6. With the sidecar's terminal hidden behind other windows for ten minutes, the gap between consecutive overrides, measured from MAVProxy's tlog, at the median and the 99th percentile.
7. Unplug the radio in a hover, plug it back in with the switch on: Waiting, no override until off then on.

## VS Code alignment

| Concern                     | VS Code                                                                                    | gcscode                                                                               | Status                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Work outside the UI process | A language server or debug adapter runs as its own process, and an extension is its client | The sidecar runs as its own process, and `extension-manual-control` is its client     | Alignment, decided in [ADR-0015](../decisions/ADR-0015-native-sidecars.md)                                                              |
| Who starts that process     | The extension spawns it                                                                    | The dev stack starts it, because a page cannot spawn processes                        | Divergence, decided in [ADR-0015](../decisions/ADR-0015-native-sidecars.md). Trigger: gcscode installed by someone other than the owner |
| The protocol to it          | JSON-RPC 2.0 (LSP, DAP): requests, responses and notifications over stdio or a socket      | Typed JSON messages over a WebSocket, sidecar to page only, with a version in `hello` | Divergence, decided here: v0 has no requests. Trigger to revisit JSON-RPC: the page's first request to a sidecar                        |
| Binding inputs to commands  | `keybindings.json`: `{ key, command, when }`, user entries over defaults                   | No bindings: the radio's channels pass straight through                               | Deferred to the mappings iteration                                                                                                      |

## `docs/out-of-scope.md` propagation

When the feat PR ships, add under a new "Native sidecars" heading:

- **Starting a sidecar outside the dev stack.** A page cannot spawn one, and the dev stack starts it today. Trigger: someone other than the owner installs gcscode, or it flies a real vehicle. Source: [ADR-0015](../decisions/ADR-0015-native-sidecars.md).
- **Sidecars on Windows and Linux.** Windows needs its own timing protection (opting out of power throttling, high-resolution timers), Linux needs device access for joysticks and serial ports (udev rules), and both need building and testing. Trigger: a Windows or Linux machine to test on. Source: this spec's Non-goals.
- **A gcscode backend.** The manual control sidecar owns its own vehicle link. Trigger: a second job needs a native process that owns the vehicle link, such as logging or several vehicles. Source: [ADR-0015](../decisions/ADR-0015-native-sidecars.md).

## `docs/roadmap.md` propagation

On merge of this spec, under Feature extensions:

- **Coming:** "Manual control v0", linking this spec.
- **Considering**, in this order: "Manual control: talking back to the radio" (Lua over a serial link, vibration on gcscode alerts and on mode changes such as auto-RTL; settles which cable, since USB is one mode at a time); "Manual control: mappings" (actions, recognising controllers, defaults per controller, import/export, gamepads through SDL's gamepad database and `MANUAL_CONTROL`); "Manual control: several controllers and the gimbal" (`GIMBAL_MANAGER_SET_PITCHYAW`, whose primary-control owner ArduPilot reports but does not enforce, so the sidecar must); "Manual control: failsafe" (required before any real vehicle).

When the feat PR ships, the v0 entry is marked shipped.

## `docs/vs-code-alignment.md` propagation

When the feat PR ships, copy the first three rows of [VS Code alignment](#vs-code-alignment) into the ledger.

## Known unknowns

- **SDL and EdgeTX's Classic joystick on macOS.** Whether SDL reports eight axes in channel order, and whether Classic mode's dial and slider come through as axes 6 and 7. The plan's first task opens the radio and prints its axes and buttons before anything else is built.
- **Input to a windowless background process.** Whether SDL delivers joystick events to the sidecar on macOS with the background hint and no window, and whether macOS asks for Input Monitoring permission. The same first task settles both. If SDL cannot read the radio there, the builder first moves SDL to the process's main thread. If that fails too, the plan stops and asks the owner before changing library, since SDL was chosen for the gamepad database the mappings iteration needs. That task needs the owner and the radio, so the plan does not run it unattended.
- **App Nap's opt-out for a command-line binary.** Measured by live step 6.
- **What SITL does when overrides stop.** SITL's own simulated receiver has default values, including channel 5 at 1800 and throttle at 1000. In SITL's defaults, 1800 is flight-mode position 6, Stabilize, so the drone may fall with its throttle at idle. Live step 5 records it, and the failsafe iteration designs it.
- **MAVProxy forwarding from an output.** Expected, since GCSs on its outputs fly through it, and live step 3 confirms it.
- **The owner's EdgeTX version.** The MK3 may run 2.12 or 3.0. The README records the version tested.
- **Build time and size of SDL from source.** Recorded in the feat PR. If it is unreasonable, Homebrew's SDL3 linked at run time is the fallback, at the cost of a single binary.

## Origin

Brainstormed 2026-11-22, after the owner bought a TX16S MK3. Research covered the MK3 and EdgeTX's USB, serial and Lua interfaces, how ArduPilot takes manual control, the languages for a sidecar, and how other GCSs map controllers (QGroundControl, Mission Planner, MAVProxy's joystick module, Blue Robotics Cockpit, SDL's controller database).
