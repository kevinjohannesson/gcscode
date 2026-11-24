//! What to do with each joystick SDL announces or removes, and how to read the open radio.

use std::ffi::CStr;

use sdl3::JoystickSubsystem;
use sdl3::joystick::{Joystick, JoystickId};

use crate::device;

/// Who the open radio is, read once when it is opened.
#[derive(Clone, Debug, PartialEq)]
pub struct RadioInfo {
    pub name: String,
    pub vendor: u16,
    pub product: u16,
    pub serial: Option<String>,
}

/// Every input's raw value at one moment, as SDL reports them.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Inputs {
    pub axes: Vec<i16>,
    pub buttons: Vec<bool>,
    pub hats: Vec<u8>,
}

/// The radio being read, if one is open. At most one: further radios are reported and left.
#[derive(Default)]
pub struct Probe {
    radio: Option<(Joystick, RadioInfo)>,
}

impl Probe {
    pub fn radio(&self) -> Option<&Joystick> {
        self.radio.as_ref().map(|(j, _)| j)
    }

    pub fn info(&self) -> Option<&RadioInfo> {
        self.radio.as_ref().map(|(_, i)| i)
    }

    /// A joystick appeared. SDL also announces every joystick plugged in before reading
    /// started this way, so both paths are one. Returns the lines to print.
    pub fn added(&mut self, joysticks: &JoystickSubsystem, which: JoystickId) -> Vec<String> {
        let (name, vendor, product) = describe(which);
        let line = device::device_line(which.raw(), &name, vendor, product);
        if !device::is_edgetx(vendor, product) {
            return vec![format!("found {line}, not an EdgeTX radio, ignored")];
        }
        if self.radio.is_some() {
            return vec![format!("found {line}, a second EdgeTX radio, ignored")];
        }
        match joysticks.open(which) {
            Ok(j) => {
                let info = RadioInfo {
                    name,
                    vendor,
                    product,
                    serial: serial(&j),
                };
                let details = format!(
                    "  serial {}  axes {}  buttons {}  hats {}",
                    info.serial.as_deref().unwrap_or("(none)"),
                    j.num_axes(),
                    j.num_buttons(),
                    j.num_hats()
                );
                self.radio = Some((j, info));
                vec![format!("opened {line}"), details]
            }
            Err(e) => vec![format!("found {line}, could not open it: {e}")],
        }
    }

    /// A joystick went away. Only the open radio's removal is reported.
    pub fn removed(&mut self, which: JoystickId) -> Option<String> {
        if self.radio().is_some_and(|j| j.id() == which) {
            self.radio = None;
            Some("radio unplugged. Waiting for it to come back.".to_string())
        } else {
            None
        }
    }
}

/// Every input's current raw value.
pub fn values(j: &Joystick) -> Inputs {
    Inputs {
        axes: (0..j.num_axes()).map(|i| j.axis(i).unwrap_or(0)).collect(),
        buttons: (0..j.num_buttons())
            .map(|i| j.button(i).unwrap_or(false))
            .collect(),
        hats: (0..j.num_hats())
            .map(|i| j.hat(i).map(|h| h.to_raw()).unwrap_or(0))
            .collect(),
    }
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
