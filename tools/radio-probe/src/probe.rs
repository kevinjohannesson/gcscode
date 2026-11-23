//! What the probe does with each joystick SDL announces or removes, and how it reads one.

use std::ffi::CStr;

use sdl3::JoystickSubsystem;
use sdl3::joystick::{Joystick, JoystickId};

use crate::report;

/// The radio being read, if one is open. At most one: further radios are reported and left.
#[derive(Default)]
pub struct Probe {
    radio: Option<Joystick>,
}

impl Probe {
    pub fn radio(&self) -> Option<&Joystick> {
        self.radio.as_ref()
    }

    /// A joystick appeared. SDL also announces every joystick plugged in before the probe
    /// started this way, so both paths are one. Returns the lines to print.
    pub fn added(&mut self, joysticks: &JoystickSubsystem, which: JoystickId) -> Vec<String> {
        let (name, vendor, product) = describe(which);
        let line = report::device_line(which.raw(), &name, vendor, product);
        if !report::is_edgetx(vendor, product) {
            return vec![format!("found {line}, not an EdgeTX radio, ignored")];
        }
        if self.radio.is_some() {
            return vec![format!("found {line}, a second EdgeTX radio, ignored")];
        }
        match joysticks.open(which) {
            Ok(j) => {
                let details = format!(
                    "  serial {}  axes {}  buttons {}  hats {}",
                    serial(&j).unwrap_or_else(|| "(none)".into()),
                    j.num_axes(),
                    j.num_buttons(),
                    j.num_hats()
                );
                self.radio = Some(j);
                vec![format!("opened {line}"), details]
            }
            Err(e) => vec![format!("found {line}, could not open it: {e}")],
        }
    }

    /// A joystick went away. Only the open radio's removal is reported.
    pub fn removed(&mut self, which: JoystickId) -> Option<String> {
        if self.radio.as_ref().is_some_and(|j| j.id() == which) {
            self.radio = None;
            Some("radio unplugged. Waiting for it to come back.".to_string())
        } else {
            None
        }
    }
}

/// Every input's current raw value, as the lines of the live block.
pub fn read(j: &Joystick) -> Vec<String> {
    let axes: Vec<i16> = (0..j.num_axes()).map(|i| j.axis(i).unwrap_or(0)).collect();
    let buttons: Vec<bool> = (0..j.num_buttons())
        .map(|i| j.button(i).unwrap_or(false))
        .collect();
    let hats: Vec<u8> = (0..j.num_hats())
        .map(|i| j.hat(i).map(|h| h.to_raw()).unwrap_or(0))
        .collect();

    let mut lines = report::axes_table(&axes);
    lines.extend(report::buttons_grid(&buttons));
    if !hats.is_empty() {
        lines.push(report::hats_line(&hats));
    }
    lines
}

/// Name and USB IDs of a joystick SDL has announced, read before opening it.
fn describe(id: JoystickId) -> (String, u16, u16) {
    let raw = id.into();
    // SAFETY: plain getters on an instance ID SDL reported; a null name is handled.
    unsafe {
        let name_ptr = sdl3::sys::joystick::SDL_GetJoystickNameForID(raw);
        let name = if name_ptr.is_null() {
            "(no name)".to_string()
        } else {
            CStr::from_ptr(name_ptr).to_string_lossy().into_owned()
        };
        (
            name,
            sdl3::sys::joystick::SDL_GetJoystickVendorForID(raw),
            sdl3::sys::joystick::SDL_GetJoystickProductForID(raw),
        )
    }
}

/// The USB serial number, which on the MK3 tells two radios apart. The safe crate lacks it.
fn serial(j: &Joystick) -> Option<String> {
    // SAFETY: `j.raw()` is an open joystick; SDL owns the returned string.
    unsafe {
        let p = sdl3::sys::joystick::SDL_GetJoystickSerial(j.raw());
        (!p.is_null()).then(|| CStr::from_ptr(p).to_string_lossy().into_owned())
    }
}
