//! The radio side: owns SDL, reads the radio the way the probe does, and publishes a new
//! snapshot whenever something changes. It never waits on the page.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use radio_probe::probe::{self, Probe};
use radio_probe::pump;
use sdl3::event::Event;
use tokio::sync::watch;

use crate::snapshot::{Radio, Snapshot};

/// How often a snapshot is taken: twice the page's redraw rate, so a change reaches it within
/// a frame.
pub const TICK: Duration = Duration::from_millis(20);

/// The snapshot for what the probe has open now.
pub fn snapshot(probe: &Probe, events_per_second: Option<u32>) -> Snapshot {
    let radio = match (probe.radio(), probe.info()) {
        (Some(j), Some(info)) => Some(Radio {
            info: info.clone(),
            inputs: probe::values(j),
        }),
        _ => None,
    };
    Snapshot {
        radio,
        events_per_second,
    }
}

/// Reads the radio until `stop` is set, publishing into `out`. Runs on the thread that
/// initialised SDL, which on macOS is best kept the main thread.
pub fn run(out: watch::Sender<Snapshot>, stop: Arc<AtomicBool>) -> Result<(), String> {
    // The process has no window, so without this SDL may deliver input only while a window of
    // ours is focused. Signals belong to the runtime that stops the whole process, not to SDL.
    sdl3::hint::set("SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS", "1");
    sdl3::hint::set("SDL_NO_SIGNAL_HANDLERS", "1");

    let sdl = sdl3::init().map_err(|e| e.to_string())?;
    let joysticks = sdl.joystick().map_err(|e| e.to_string())?;
    let mut events = sdl.event_pump().map_err(|e| e.to_string())?;

    let mut probe = Probe::default();
    let mut rate = pump::Rate::default();

    while !stop.load(Ordering::Relaxed) {
        pump::until(&mut events, Instant::now() + TICK, |event| match event {
            Event::JoyDeviceAdded { which, .. } => {
                for line in probe.added(&joysticks, which) {
                    println!("station: {line}");
                }
            }
            Event::JoyDeviceRemoved { which, .. } => {
                if let Some(line) = probe.removed(which) {
                    println!("station: {line}");
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

        let next = snapshot(&probe, rate.per_second(Instant::now()));
        // send_if_modified never fails: with no page connected the snapshot is simply kept.
        out.send_if_modified(|current| {
            if *current == next {
                false
            } else {
                *current = next;
                true
            }
        });
    }
    Ok(())
}
