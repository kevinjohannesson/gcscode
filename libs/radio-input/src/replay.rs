//! Plays a recorded session through an SDL virtual joystick that has the recorded radio's
//! name and USB ID, so whatever reads radios through SDL reads the replay as it read the radio.
//!
//! A virtual joystick exists only inside the process that attached it, so a replay always
//! runs in the reading process: a test, the probe, or a station build made for replay.

use std::ffi::CString;
use std::time::{Duration, Instant};

use sdl3::sys::joystick as sys;

use crate::recording::{Change, RadioState, Recording};

/// The virtual radio while it is plugged in.
struct Attached {
    id: sys::SDL_JoystickID,
    handle: *mut sys::SDL_Joystick,
    // SDL keeps the pointer the descriptor gave it, so the name lives as long as the device.
    _name: CString,
}

/// Plays a recording, one change at a time, on whatever clock the caller keeps. SDL must be
/// initialised with its joystick subsystem before [`Player::start`].
pub struct Player {
    recording: Recording,
    next: usize,
    attached: Option<Attached>,
}

// SAFETY: SDL's joystick functions take SDL's joystick lock, so a player may drive its
// virtual radio from a thread other than the one that reads it.
unsafe impl Send for Player {}

impl Player {
    pub fn new(recording: Recording) -> Self {
        Player {
            recording,
            next: 0,
            attached: None,
        }
    }

    pub fn recording(&self) -> &Recording {
        &self.recording
    }

    /// Plugs in the recorded radio, holding the header's values.
    pub fn start(&mut self) -> Result<(), String> {
        let radio = self.recording.radio.clone();
        self.plug(&radio)
    }

    /// Applies every change up to and including `t`, microseconds into the recording.
    pub fn play_until(&mut self, t: u64) -> Result<(), String> {
        while let Some(c) = self.recording.changes.get(self.next) {
            if c.t() > t {
                break;
            }
            let c = c.clone();
            self.apply(&c)?;
            self.next += 1;
        }
        Ok(())
    }

    /// When the next change is due, or `None` once every change has been played.
    pub fn next_at(&self) -> Option<u64> {
        self.recording.changes.get(self.next).map(Change::t)
    }

    fn apply(&mut self, c: &Change) -> Result<(), String> {
        match c {
            Change::Unplugged { .. } => {
                self.unplug();
                Ok(())
            }
            Change::Plugged { plugged, .. } => self.plug(plugged),
            _ => {
                let a = self
                    .attached
                    .as_ref()
                    .ok_or("a change while the radio is unplugged")?;
                // SAFETY: `a.handle` is the open virtual radio; the index is checked by SDL.
                let set = unsafe {
                    match *c {
                        Change::Axis { axis, value, .. } => {
                            sys::SDL_SetJoystickVirtualAxis(a.handle, axis.into(), value)
                        }
                        Change::Button {
                            button, pressed, ..
                        } => sys::SDL_SetJoystickVirtualButton(a.handle, button.into(), pressed),
                        Change::Hat { hat, value, .. } => {
                            sys::SDL_SetJoystickVirtualHat(a.handle, hat.into(), value)
                        }
                        _ => unreachable!(),
                    }
                };
                set.then_some(())
                    .ok_or_else(|| format!("SDL refused {c:?}"))
            }
        }
    }

    fn plug(&mut self, radio: &RadioState) -> Result<(), String> {
        self.unplug();
        let name = CString::new(radio.name.clone()).map_err(|e| e.to_string())?;
        let mut desc = sys::SDL_VirtualJoystickDesc::new();
        desc.name = name.as_ptr();
        desc.vendor_id = radio.vendor_id;
        desc.product_id = radio.product_id;
        desc.naxes = radio.axes.len() as u16;
        desc.nbuttons = radio.buttons.len() as u16;
        desc.nhats = radio.hats.len() as u16;
        // SAFETY: `desc` is fully initialised and `name` outlives the device.
        let id = unsafe { sys::SDL_AttachVirtualJoystick(&desc) };
        if id.0 == 0 {
            return Err("SDL refused the virtual radio".into());
        }
        // SAFETY: `id` is the joystick just attached; values are set through a handle of our own.
        let handle = unsafe { sys::SDL_OpenJoystick(id) };
        if handle.is_null() {
            // SAFETY: as above.
            unsafe { sys::SDL_DetachVirtualJoystick(id) };
            return Err("SDL could not open the virtual radio".into());
        }
        // SAFETY: `handle` is open, and every index is within the counts it was attached with.
        unsafe {
            for (i, v) in radio.axes.iter().enumerate() {
                sys::SDL_SetJoystickVirtualAxis(handle, i as i32, *v);
            }
            for (i, v) in radio.buttons.iter().enumerate() {
                sys::SDL_SetJoystickVirtualButton(handle, i as i32, *v);
            }
            for (i, v) in radio.hats.iter().enumerate() {
                sys::SDL_SetJoystickVirtualHat(handle, i as i32, *v);
            }
        }
        self.attached = Some(Attached {
            id,
            handle,
            _name: name,
        });
        Ok(())
    }

    fn unplug(&mut self) {
        if let Some(a) = self.attached.take() {
            // SAFETY: `a` is a virtual radio this player attached and opened.
            unsafe {
                sys::SDL_CloseJoystick(a.handle);
                sys::SDL_DetachVirtualJoystick(a.id);
            }
        }
    }
}

impl Drop for Player {
    fn drop(&mut self) {
        self.unplug();
    }
}

/// Plays `recording` in real time on a thread of its own, starting now. When `hold` is set,
/// the radio stays plugged in with its last values once the recording ends, until the process
/// exits; otherwise it is unplugged then. SDL must already be initialised.
pub fn play_in_real_time(
    recording: Recording,
    hold: bool,
) -> std::thread::JoinHandle<Result<(), String>> {
    std::thread::spawn(move || {
        let mut player = Player::new(recording);
        player.start()?;
        let started = Instant::now();
        while let Some(t) = player.next_at() {
            let due = started + Duration::from_micros(t);
            if let Some(wait) = due.checked_duration_since(Instant::now()) {
                std::thread::sleep(wait);
            }
            player.play_until(t)?;
        }
        if hold {
            loop {
                std::thread::park();
            }
        }
        Ok(())
    })
}
