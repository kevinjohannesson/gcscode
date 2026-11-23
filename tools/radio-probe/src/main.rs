//! radio-probe: opens an EdgeTX radio in USB joystick mode (the TX16S among them) and prints
//! the raw axes, buttons and hats SDL reports for it, live. It reads and sends nothing anywhere.

use std::io::{Write, stdout};
use std::time::{Duration, Instant};

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

    let mut rate = pump::Rate::default();
    let mut quit = false;

    while !quit {
        pump::until(&mut events, Instant::now() + REDRAW, |event| match event {
            Event::Quit { .. } => quit = true,
            Event::JoyDeviceAdded { which, .. } => {
                panel.clear();
                for line in probe.added(&joysticks, which) {
                    println!("{line}");
                }
            }
            Event::JoyDeviceRemoved { which, .. } => {
                if let Some(line) = probe.removed(which) {
                    panel.clear();
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
            panel.draw(&lines);
        }
    }

    panel.clear();
    println!("radio-probe: stopped.");
    Ok(())
}

/// A block of lines redrawn in place, so the values update live without scrolling.
#[derive(Default)]
struct Panel {
    height: usize,
}

impl Panel {
    fn draw(&mut self, lines: &[String]) {
        let mut out = stdout().lock();
        if self.height > 0 {
            let _ = write!(out, "\x1b[{}F", self.height); // up to the block's first line
        }
        for line in lines {
            let _ = writeln!(out, "\x1b[2K{line}");
        }
        let _ = write!(out, "\x1b[J"); // erase anything left below
        let _ = out.flush();
        self.height = lines.len();
    }

    /// Erases the block, so a permanent message can be printed in its place.
    fn clear(&mut self) {
        if self.height > 0 {
            let mut out = stdout().lock();
            let _ = write!(out, "\x1b[{}F\x1b[J", self.height);
            let _ = out.flush();
            self.height = 0;
        }
    }
}
