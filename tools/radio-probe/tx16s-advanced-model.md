# TX16S Advanced USB joystick model

How to set up a model on a RadioMaster TX16S MK3 so that, in USB joystick mode, every control shows up in radio-probe under a number you chose. Checked against the EdgeTX 2.12.5 source, then on the owner's radio on macOS on 2026-11-23: axes 0 to 7 follow channels 1 to 8, and all 28 buttons show with their pressed states.

In short: sticks, pots and sliders go on channels 1 to 8 as the eight axes, so probe axis _n_ is channel _n_ + 1. Every switch's channel is a **Btn** with Button Mode **Pulse** and Positions matching the switch (2POS or 3POS), so each position has its own button and moving the switch presses that position's button once for 0.2 s. Channel 16 stays a held button, for the control switch.

## Before you start

1. **Check the firmware.** Press **SYS** and page to the **Version** tab. Advanced mode first appears in EdgeTX 2.9.0. Its code is the same in every release from 2.11.0 to 2.12.5 (only Classic mode's report layout changed after 2.12.0), so any of those behaves as this guide describes. The owner's radio runs a pre-2.12.0 self-build.
2. **Make a new model.** Copy your current model, or the Classic `gcscode` model the drafted manual control v0 spec describes, and name the copy `gcscode-adv`. Keep a Classic model too: see [What to watch for](#what-to-watch-for).
3. **Turn the RF modules off** in the copy (Model Setup, Internal RF and External RF set to OFF). The manual says this lets the mixer run at 1000 Hz in joystick mode, and the model never binds a receiver.
4. **USB mode.** In SYS, Radio Setup, leave USB Mode on **Ask** so the radio asks on plug-in, or set it to **Joystick**. When it asks, choose **USB Joystick (HID)**.

## Step 1: put each control on a channel

Advanced mode still reports the model's **channel outputs**, not raw controls, so first give every control its own channel in **MIXES**. Each mix is the control as source, weight 100, offset 0, no switch. Leave every output in **OUTPUTS** at its default (limits -100 to +100, no subtrim, not reversed): the button modes cut the channel's range into equal slices, so a shifted output lands in the wrong position.

| Channel      | Mix source                         | Kind                             |
| ------------ | ---------------------------------- | -------------------------------- |
| CH1          | Ail stick                          | stick                            |
| CH2          | Ele stick                          | stick                            |
| CH3          | Thr stick                          | stick                            |
| CH4          | Rud stick                          | stick                            |
| CH5          | S1                                 | pot                              |
| CH6          | S2                                 | pot                              |
| CH7          | LS                                 | rear slider                      |
| CH8          | RS                                 | rear slider                      |
| CH9          | SA                                 | 3-position                       |
| CH10         | SB                                 | 3-position                       |
| CH11         | SC                                 | 3-position                       |
| CH12         | SD                                 | 3-position                       |
| CH13         | SE                                 | 3-position                       |
| CH14         | SF                                 | 2-position                       |
| CH15         | SG                                 | 3-position                       |
| CH16         | your control switch (SF suggested) | held, for the control switch     |
| CH17         | SH                                 | momentary                        |
| CH18 to CH23 | SW1 to SW6                         | the six buttons above the screen |

Channels 1 to 4 already exist in a new model, in the radio's default channel order (AETR unless you changed it in Radio Setup). The switch types are the MK3's as shipped (SA to SE and SG 3-position, SF 2-position, SH momentary). The MK3's switch boards can be swapped, so check yours and use the matching Positions in step 2. A switch can feed two channels, which is why CH16 can reuse SF. Set SW1 to SW6 to **Momentary** where the radio configures its function switches, so each reads -100 released and +100 pressed.

## Step 2: set up the USB Joystick page

Open **MODEL**, **Model Setup**, **USB Joystick**, and set:

- **Mode:** Advanced. The other fields appear only in Advanced.
- **Interface mode:** Joystick. Gamepad and MultiAxis change only the device type the computer sees.
- **Circular cutout:** None, so each axis reaches its corners.

Then open **Channel Settings**. It lists CH1 to CH26: Advanced mode can configure only the first 26 channels. Tap a channel, choose **Edit**, and set it as below. **Button no.** counts from 0, like the probe, and the list shows a multi-button channel's range, such as `0..2`. When everything is set, press **Apply changes**, because nothing takes effect until then.

| Channel                   | Mode | Axis or Button Mode | Positions | Button no. | Probe shows                  |
| ------------------------- | ---- | ------------------- | --------- | ---------- | ---------------------------- |
| CH1                       | Axis | X                   |           |            | axis 0                       |
| CH2                       | Axis | Y                   |           |            | axis 1                       |
| CH3                       | Axis | Z                   |           |            | axis 2                       |
| CH4                       | Axis | rotX                |           |            | axis 3                       |
| CH5                       | Axis | rotY                |           |            | axis 4                       |
| CH6                       | Axis | rotZ                |           |            | axis 5                       |
| CH7                       | Axis | Slider              |           |            | axis 6                       |
| CH8                       | Axis | Dial                |           |            | axis 7                       |
| CH9 (SA)                  | Btn  | Pulse               | 3POS      | 0          | buttons 0, 1, 2              |
| CH10 (SB)                 | Btn  | Pulse               | 3POS      | 3          | buttons 3, 4, 5              |
| CH11 (SC)                 | Btn  | Pulse               | 3POS      | 6          | buttons 6, 7, 8              |
| CH12 (SD)                 | Btn  | Pulse               | 3POS      | 9          | buttons 9, 10, 11            |
| CH13 (SE)                 | Btn  | Pulse               | 3POS      | 12         | buttons 12, 13, 14           |
| CH14 (SF)                 | Btn  | Pulse               | 2POS      | 15         | buttons 15, 16               |
| CH15 (SG)                 | Btn  | Pulse               | 3POS      | 17         | buttons 17, 18, 19           |
| CH16 (control)            | Btn  | Normal              | Push      | 20         | button 20, held while on     |
| CH17 (SH)                 | Btn  | Normal              | Push      | 21         | button 21, held while pushed |
| CH18 to CH23 (SW1 to SW6) | Btn  | Normal              | Push      | 22 to 27   | buttons 22 to 27             |
| CH24 to CH26              | None |                     |           |            |                              |

Leave **Inversion** Off everywhere. Within a switch, the first button is the position with the lowest channel value (-100), the next is the middle (0) and the last is +100. So for SA, button 0 is the position that reads -100 in the channel monitor. Inversion reverses that order.

This uses 28 of the 32 buttons, leaving 28 to 31 free, for example for T5 and T6. The eight axes run in HID usage order: X, Y, Z, rotX, rotY and rotZ can each be used once (the page shows **!Axis collision!** otherwise), while Slider, Dial and Wheel may repeat. EdgeTX writes axes into the report in channel order, and putting them in usage order too means the probe numbers them the same way whichever order SDL picks. An overlapping button range shows **!Button no. collision!**.

## Step 3: check it in the probe

1. Unplug the radio, select `gcscode-adv`, then plug it in and choose **USB Joystick (HID)**. Apply changes can re-plug the radio in software, but the EdgeTX how-to says a computer may keep the old joystick description until the cable is unplugged, so replug after every change.
2. Run `pnpm --filter radio-probe start`. The header should read **axes 8 buttons 28**: in Advanced mode the button count is the highest button used plus one. Classic mode shows buttons 24.
3. Right after it opens, buttons for the current positions of SA to SG may flash once. That is the burst on connect (see [What to watch for](#what-to-watch-for)), not a fault.
4. Move each stick, pot and slider through its range. Each should move only its own axis from the table in step 2, from about -32768 to 32767.
5. Flip SA from one end to the other, slowly. Each stop should show exactly one button in the `pressed:` line for about 0.2 s, then none. Going -100, 0, +100 should give 0, 1, 2, and coming back 1, 0. Repeat for SB to SG.
6. Turn the control switch on and off. Button 20 should stay pressed for as long as it is on.
7. Press SH and SW1 to SW6. Each holds its button (21 to 27) while pressed.

If a switch's middle position gives nothing or gives the wrong button, open the channel monitor and check the channel really reads -100, 0 and +100.

## How the button modes behave

The manual describes each mode in a line. This is what EdgeTX's `usb_joystick.cpp` actually does, for a channel with N positions starting at button B. Every press that times out lasts 20 ticks of 10 ms, so 0.2 s.

| Button Mode | Buttons used             | What a position change does                                                                                          | Fits this model                          |
| ----------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Normal      | N (Push: 1)              | Holds the button for the current position for as long as the switch stays there                                      | No, it stays pressed                     |
| Pulse       | N (Push: 1)              | Presses the new position's button once for 0.2 s, then releases all. Push presses only when the channel goes above 0 | **Yes**, one press per position          |
| SWEmu       | 1                        | Toggles button B each time the channel goes from off to on, so a switch acts like a push-on, push-off button         | No                                       |
| Delta       | 2 (B and B+1)            | Cuts the channel into 32 steps. A step down presses B, a step up presses B+1, each for 0.2 s                         | Only if you want direction, not position |
| Companion   | 1 or 2 for 2POS and 3POS | Encodes the position in binary for EdgeTX Companion's simulator                                                      | No                                       |

Pulse is the right mode here because it tells you which position the switch went to, not just that it moved. Delta on a 3-position switch only says up or down, and on a pot or slider it fires a press roughly every 6% of travel, which is what it is meant for. If you do try Delta, set Positions to 2POS: the collision check counts a Push channel as one button, but Delta always writes two.

Logical switches or special functions are not needed. You could build the same thing by driving one Push channel per position from a logical switch that is true for one position, but Pulse does it natively in one channel per switch. That route only matters on EdgeTX 2.8 or older, or on a black-and-white radio with under 1 MB of flash, which the how-to says has no Advanced mode.

## What to watch for

- **The drafted manual control v0 spec assumes Classic mode.** It maps axes 0 to 7 to channels 1 to 8, buttons 0 to 6 to channels 9 to 15, and button 7 to channel 16, the control switch. In this model channel 16 is button 20 and channels 9 to 15 are pulses, so a sidecar built to that table would read this model wrongly. Until the spec settles which layout it reads, keep a Classic model for it.
- **Keep the control switch held.** Channel 16 is Normal, not Pulse, on purpose: control has to be a state a reader can see at any moment. The same goes for anything safety-related, such as RTL. A pulse the reader misses, because it was not running or was stalled, loses that switch's position until it moves again.
- **The burst on connect.** EdgeTX starts each Pulse channel with no last value, so on plug-in, model change or Apply changes it presses the current position of every switch once. A reader can use that burst to learn where the switches are, or should ignore presses in the first 0.2 s.
- **Two moves within 0.2 s.** The second move replaces the first press and restarts the timer, so a fast flick through the middle position may show only the end position.
- **Windows only.** The manual says Windows may see the radio as a Joystick whatever the Interface mode. macOS and Linux are fine.

## Sources

- [EdgeTX manual: USB Joystick (color radios)](https://manual.edgetx.org/color-radios/model-settings/model-setup/usb-joystick): the page's fields, Classic mapping, Apply Changes, RF modules off, the Windows note.
- [EdgeTX how-to: configure advanced joystick](https://manual.edgetx.org/edgetx-how-to/configure-advanced-joystick-with-edgetx): replug after changes, duplicate buttons, no Advanced mode under 1 MB of flash.
- [EdgeTX how-to: joystick mapping for game developers](https://manual.edgetx.org/edgetx-how-to/joystick-mapping-information-for-game-developers): USB ID 1209:4F54, zero-based button numbers.
- [EdgeTX PR 2277](https://github.com/EdgeTX/edgetx/pull/2277): the design discussion, logical OR on shared button numbers.
- [usb_joystick.cpp](https://github.com/EdgeTX/edgetx/blob/main/radio/src/usb_joystick.cpp), [usb_joystick.h](https://github.com/EdgeTX/edgetx/blob/main/radio/src/usb_joystick.h) and [datastructs_private.h](https://github.com/EdgeTX/edgetx/blob/main/radio/src/datastructs_private.h): the mode behaviour, 26 channels, 32 buttons, 0.2 s presses. The v2.12.5 tag's `usb_joystick.cpp` is identical to main; v2.8.0 has none of the button modes.
- [en.h](https://github.com/EdgeTX/edgetx/blob/main/radio/src/translations/i18n/en.h): the exact on-screen labels.
- [EdgeTX releases](https://github.com/EdgeTX/edgetx/releases): 2.12.5 is the latest stable release.
- [RC Soar's TX16S MK3 review](https://rc-soar.blogspot.com/2026/01/radiomaster-tx16s-mk3-review.html): the MK3's switches, pots, sliders and SW1 to SW6.
