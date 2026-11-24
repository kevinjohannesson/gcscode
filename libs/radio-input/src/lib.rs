//! Reads an EdgeTX radio, such as the RadioMaster TX16S, in USB joystick mode through SDL,
//! and turns its raw input into named controls by profile. It reads only: nothing here sends
//! to the radio or anywhere else.
//!
//! A library of its own so that `tools/radio-probe`, which proves the reading in a terminal,
//! and gcscode's station process both run the same code without one depending on the other.

pub mod device;
pub mod mapping;
pub mod probe;
pub mod pump;
