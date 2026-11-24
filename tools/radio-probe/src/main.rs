//! radio-probe: opens an EdgeTX radio in USB joystick mode (the TX16S among them) and prints
//! the raw axes, buttons and hats SDL reports for it, live. It reads and sends nothing anywhere.

use std::io::{Write, stdout};
use std::time::{Duration, Instant};

use radio_probe::panel::{self, Panel};
use radio_probe::probe::{self, Probe};
use radio_probe::pump;
use sdl3::event::Event;

/// How often the live block is redrawn.
const REDRAW: Duration = Duration::from_millis(50);

fn main() {
    if let Err(e) = run() {
        eprintln!("radio-probe: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    // The probe has no window, so without this SDL may deliver input only while a window of
    // ours is focused.
    sdl3::hint::set("SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS", "1");

    let sdl = sdl3::init().map_err(|e| e.to_string())?;
    let joysticks = sdl.joystick().map_err(|e| e.to_string())?;
    let mut events = sdl.event_pump().map_err(|e| e.to_string())?;

    println!("radio-probe: waiting for an EdgeTX radio in USB joystick mode. Ctrl-C quits.");
    let mut probe = Probe::default();
    let mut panel = Panel::default();
    let _cursor = HiddenCursor::new();

    let mut rate = pump::Rate::default();
    let mut quit = false;

    while !quit {
        pump::until(&mut events, Instant::now() + REDRAW, |event| match event {
            Event::Quit { .. } => quit = true,
            Event::JoyDeviceAdded { which, .. } => {
                emit(&panel.clear());
                for line in probe.added(&joysticks, which) {
                    println!("{line}");
                }
            }
            Event::JoyDeviceRemoved { which, .. } => {
                if let Some(line) = probe.removed(which) {
                    emit(&panel.clear());
                    println!("{line}");
                }
            }
            Event::JoyAxisMotion { which, .. }
            | Event::JoyButtonDown { which, .. }
            | Event::JoyButtonUp { which, .. }
            | Event::JoyHatMotion { which, .. }
                if probe.radio().is_some_and(|j| j.id() == which) =>
            {
                rate.count(Instant::now())
            }
            _ => {}
        });

        if let Some(j) = probe.radio() {
            let mut lines = probe::read(j);
            lines.push(match rate.per_second(Instant::now()) {
                Some(n) => format!("input events in the last second: {n}"),
                None => "input events in the last second: (waiting for input)".to_string(),
            });
            emit(&panel.frame(&lines));
        }
    }

    emit(&panel.clear());
    println!("radio-probe: stopped.");
    Ok(())
}

/// Writes bytes to the terminal in one go.
fn emit(bytes: &str) {
    if !bytes.is_empty() {
        let mut out = stdout().lock();
        let _ = out.write_all(bytes.as_bytes());
        let _ = out.flush();
    }
}

/// Hides the cursor while it lives and shows it again when dropped, on any way out of `run`.
struct HiddenCursor;

impl HiddenCursor {
    fn new() -> Self {
        emit(panel::HIDE_CURSOR);
        HiddenCursor
    }
}

impl Drop for HiddenCursor {
    fn drop(&mut self) {
        emit(panel::SHOW_CURSOR);
    }
}
