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

or `cargo test` here. They use SDL's virtual joysticks in place of a radio, so they need no hardware. The radio itself is checked by running the probe.
