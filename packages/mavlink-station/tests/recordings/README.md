# Recordings

Recorded radio sessions that `tests/replay.rs` replays through the station's radio side, each checked at every 20 ms tick against the recording folded to that instant. Every `.jsonl` file here is picked up. The format is the [virtual radio spec](../../../../docs/specs/2026-11-24-virtual-radio.md)'s; `radio-probe --record` writes one ([its README](../../../../tools/radio-probe/README.md#recording-and-replaying)).

Each file is cut to one purpose and kept under about 1 MB (some 30 s of a moving stick).

| File                               | What happened while recording                                                                                                                                                                                 | Radio                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `synthetic-sweep-and-replug.jsonl` | Not a radio: written by hand for the first tests. Throttle ramps up and roll sweeps for 1 s, SA's top button pulses, control goes on, then an unplug and a replug with throttle held at 12000 and control on. | gcscode-adv's shape: 8 axes, 28 buttons |
