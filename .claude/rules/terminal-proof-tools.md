---
paths:
  - 'tools/**'
---

# Terminal proof tools

Learned building `tools/radio-probe`. They apply to any tool that shows live data in a terminal.

- **Redraw on a fixed tick, never when input goes quiet.** A device can send an event every millisecond while it moves, so a loop that waits for a quiet queue freezes the display until the movement stops. Take events only until the next redraw is due.
- **No flicker.** Build each frame whole and send it in one write. Overwrite lines in place and erase only what is left to their right, never erase first. Skip a frame that has not changed. Hide the cursor while running, and restore it on every exit, Ctrl-C included.
- **Show the data rate.** An events-per-second line tells slow data apart from a slow display.
- **Plain language over encodings.** "pressed: 7, 9" beats a row of dots to count. A grid or table gets numbered headers, and anything shown only by colour also appears as text.
- **No new dependencies for looks.** Box-drawing characters and a few ANSI codes are enough.
- **Pure formatting, tested without hardware.** Keep the text a tool prints in pure functions with exact expected strings, and drive the rest with a simulated device where one exists, such as SDL's virtual joysticks.
- **Device facts go in the tool's README,** such as the TX16S in Classic mode mapping button _n_ to channel _n_ + 9.
