# radio-probe

A terminal tool that opens an EdgeTX radio in USB joystick mode, such as the RadioMaster TX16S MK3, and prints the raw value of every axis, button and hat SDL reports for it, live. It reads and nothing more: it sends nothing to the radio, to gcscode or to any vehicle.

It is a proof tool, the first rung of manual control: before anything is built on the radio's input, this shows what that input is. It stays in the repo as a diagnostic, for checking a radio, a cable or a new EdgeTX version.

## Setup (macOS)

Needs Rust (`rustup`) and CMake, since SDL is built from source and linked into the binary:

```sh
brew install cmake
```

The first build compiles SDL and takes a few minutes. Later builds take seconds.

## Running it

From the repo root:

```sh
pnpm --filter radio-probe start
```

or `cargo run --release` from this folder. Ctrl-C quits.

Then plug in the radio. When it asks how to use USB, choose **USB Joystick (HID)**. The probe prints the radio it opened, then a block that updates as you move the sticks and switches:

```text
opened [3] TX16SMK3 Joystick  1209:4f54  (EdgeTX radio)
  serial 0123456789AB  axes 8  buttons 24  hats 0
┌──────┬────────┬───────────────────────────────────┐
│ axis │  value │ -32768          0           32767 │
├──────┼────────┼───────────────────────────────────┤
│    0 │      0 │ ················█················ │
│    1 │    -32 │ ················█················ │
│    2 │ -32768 │ █████████████████················ │
│    3 │      0 │ ················█················ │
│    4 │  32767 │ ················█████████████████ │
│    5 │      0 │ ················█················ │
│    6 │      0 │ ················█················ │
│    7 │      0 │ ················█················ │
└──────┴────────┴───────────────────────────────────┘
buttons, highlighted when pressed:
┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐
│  0 │  1 │  2 │  3 │  4 │  5 │  6 │  7 │  8 │  9 │ 10 │ 11 │
├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤
│ 12 │ 13 │ 14 │ 15 │ 16 │ 17 │ 18 │ 19 │ 20 │ 21 │ 22 │ 23 │
└────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘
pressed: 7, 9
input events in the last second: 0
```

- **Axes** are a table of SDL's raw values, from -32768 to 32767, numbered from 0. The bar fills from the middle, 0, out to the value.
- **Buttons** are a numbered grid, with a pressed button highlighted in reverse video (not visible in the plain text above), and the `pressed:` line lists the pressed ones by number. In Classic mode button _n_ is channel _n_ + 9, so in the example above channels 16 and 18 are above zero.
- **Hats**, if a radio reports any, show SDL's bitmask: 1 up, 2 right, 4 down, 8 left.
- **Input events in the last second** counts every axis, button and hat change SDL delivered from the radio. While a stick moves it shows how often the radio reports; it drops to 0 when nothing moves, since SDL sends only changes.

The block redraws 20 times a second, also while events are still pouring in, so a moving stick is shown moving.

Unplugging the radio prints a line and the probe waits. Plugging it back in opens it again.

The probe opens only EdgeTX's joystick, USB ID `1209:4f54`. Any other controller is listed and left alone, and so is a second EdgeTX radio.

## Mapped: what each input means

`--mapped` also shows what each input means to gcscode, through a **profile**: a file that says, for one radio set up one way, which axis is roll, pitch, throttle, yaw or aux 1 to 4 and how it is calibrated, which held button is each on/off control (control, RTL), and which Pulse buttons together make one switch with named positions. `--profile <file>` adds a profile of your own, tried before the bundled ones:

```sh
pnpm --filter radio-probe start -- --mapped
pnpm --filter radio-probe start -- --profile my-radio.toml
```

The bundled profile is [`gcscode-adv.toml`](../../libs/radio-input/profiles/gcscode-adv.toml), in `libs/radio-input`, for the TX16S on the model in [tx16s-advanced-model.md](tx16s-advanced-model.md). The axes table gets a control column, and lines under the button grid name each switch's position, each on/off control, what the profile leaves out and the inputs nothing reads:

```text
  mapped with profile gcscode-adv
┌──────┬────────┬────────────────┬───────────────────────────────────┐
│ axis │  value │ control        │ -32768          0           32767 │
├──────┼────────┼────────────────┼───────────────────────────────────┤
│    0 │  -3932 │ roll      -12% │ ··············███················ │
│    1 │      0 │ pitch       0% │ ················█················ │
│    2 │  -8520 │ throttle   37% │ ············█████················ │
…
profile gcscode-adv
SA middle   SB up       SC unknown  SD up       SE up       SF down     SG up
control on (button 20)
not mapped: RTL
unmapped axes: none   unmapped buttons: 21, 22, 23, 24, 25, 26, 27
```

What a profile holds, and the rules it is checked against ([`libs/radio-input`](../../libs/radio-input/README.md), `src/mapping.rs`):

- **Which radio.** `[match]` names the USB vendor and product id and text the joystick's name must contain: SDL may put the USB manufacturer first, so the TX16S shows as `OpenTX TX16SMK3 Joystick` on some systems and `TX16SMK3 Joystick` on others, and `TX16SMK3 Joystick` matches both; `axes` and `buttons`, when given, must match the radio's counts too. The TX16S reports 28 buttons on its Advanced model and 24 on a Classic one, so the counts tell the two apart. A profile also matches only a radio that has every input it reads. The first profile that matches wins, yours before the bundled ones, so when two could match one radio, order decides.
- **When none matches.** The probe, and the station, print a line per profile naming what it expects that the radio is not, such as `profile gcscode-adv expects 28 buttons, the radio has 24`, or `expects a name containing "TX16SMK3 Joystick", the radio is "…"`.
- **Axes** map to roll, pitch, throttle, yaw and aux 1 to 4, each with a raw `min` (the -100% end, 0% for throttle), `centre` and `max` (100%), and an optional `deadband`: within that many raw steps of the centre the axis reads 0%, and from there it rises evenly, so it never jumps. Each half is calibrated on its own, so an off-centre stick still reads 0% at rest and -100% and 100% at its ends. Throttle reads 0% to 100%. A reversed axis has `min` above `max`.
- **Switches** are EdgeTX Pulse switches: one button per position, pressed for 0.2 s when the switch moves there. A switch keeps its last position after the press ends, and shows `unknown` until one of its buttons has been seen. A press of two of its buttons at once is ignored. The radio's connect burst, which presses every switch's current position once, sets each switch's starting position, if it comes after the probe opened the radio.
- **On/off controls** (control and RTL) may only map to a held button, never to a switch position or a switch's Pulse button: a Pulse switch's position is lost whenever a press is missed, and these must be readable at any moment. A profile that breaks this, or any other rule (an axis or button used twice, a centre outside min and max, a deadband as wide as a half, an unknown key), is refused with one line saying why, and the probe stops.

Without `--mapped` or `--profile` the probe prints raw values only, exactly as before.

## What it shows about the radio

In EdgeTX's default Classic joystick mode, the radio reports its model's channel outputs, not its raw sticks: channels 1–8 as the eight axes and channels 9–32 as buttons 0–23, with a button pressed when its channel is above zero. So what you see depends on the radio's model and mixer, and changing a mix changes the output.

For a TX16S model that gives every stick, switch and button its own number, using EdgeTX's Advanced joystick mode, see [tx16s-advanced-model.md](tx16s-advanced-model.md).

## If nothing shows up

- **No "found" line:** the radio is in another USB mode, such as storage or serial. Unplug it and choose Joystick when the radio asks, or set USB Mode to Joystick in the radio's setup.
- **Opened, but the values do not change:** macOS may need Input Monitoring for the terminal you run it from (System Settings, Privacy & Security, Input Monitoring). Add the terminal app, then run the probe again.
- **Values change only while the terminal is in front:** the probe sets SDL's background-input hint, so report this. It is one of the things this tool exists to find out.

## Tests

```sh
pnpm --filter radio-probe test:rust
```

or `cargo test` here. They use SDL's virtual joysticks in place of a radio, so they need no hardware. The radio itself is checked by running the probe. The reading, the profiles and their rules are [`libs/radio-input`](../../libs/radio-input/README.md)'s, and are tested there (`pnpm --filter radio-input test:rust`).
