//! radio-probe's parts, kept in a library so the tests can drive them with SDL's virtual
//! joysticks instead of a real radio. The reading itself is `libs/radio-input`'s.

use sdl3::joystick::Joystick;

pub mod mapped_report;
pub mod panel;
pub mod report;

/// Every input's current raw value, as the lines of the live block.
pub fn read(j: &Joystick) -> Vec<String> {
    let v = radio_input::probe::values(j);
    let mut lines = report::axes_table(&v.axes);
    lines.extend(report::buttons_grid(&v.buttons));
    if !v.hats.is_empty() {
        lines.push(report::hats_line(&v.hats));
    }
    lines
}
