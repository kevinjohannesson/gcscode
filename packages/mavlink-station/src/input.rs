//! The radio side: owns SDL, reads the radio the way the probe does, and publishes a new
//! snapshot whenever something changes. It never waits on the page.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use radio_input::mapping::{self, Mapper, Profile};
use radio_input::probe::{self, Probe};
use radio_input::pump;
use sdl3::event::Event;
use tokio::sync::watch;

use crate::snapshot::{Radio, Snapshot};

/// How often a snapshot is taken: twice the page's redraw rate, so a change reaches it within
/// a frame.
pub const TICK: Duration = Duration::from_millis(20);

/// The snapshot for what the probe has open now, through `mapper` when a profile is for it.
/// Taking the snapshot is also what moves the mapper on, so it happens every tick, whether
/// or not a page is connected.
pub fn snapshot(
    probe: &Probe,
    mapper: Option<&mut Mapper>,
    events_per_second: Option<u32>,
) -> Snapshot {
    let radio = match (probe.radio(), probe.info()) {
        (Some(j), Some(info)) => Some(Radio {
            info: info.clone(),
            inputs: probe::values(j),
        }),
        _ => None,
    };
    let controls = match (&radio, mapper) {
        (Some(r), Some(m)) => Some(m.update(&r.inputs)),
        _ => None,
    };
    Snapshot {
        radio,
        controls,
        events_per_second,
    }
}

/// The mapper for the radio the probe has just opened, and the lines that say which profile
/// it uses, or what each profile expects that the radio is not.
pub fn mapper_for(probe: &Probe, profiles: &[Profile]) -> (Option<Mapper>, Vec<String>) {
    let (Some(j), Some(info)) = (probe.radio(), probe.info()) else {
        return (None, Vec::new());
    };
    let (axes, buttons) = (j.num_axes() as usize, j.num_buttons() as usize);
    match mapping::find(profiles, info, axes, buttons) {
        Some(p) => (
            Some(Mapper::new(p.clone())),
            vec![format!("mapped with profile {}", p.name)],
        ),
        None => {
            let mut lines = vec![format!(
                "no profile matches this radio ({axes} axes, {buttons} buttons), so it serves raw values only"
            )];
            lines.extend(
                mapping::why_none_match(profiles, info, axes, buttons)
                    .into_iter()
                    .map(|why| format!("  {why}")),
            );
            (None, lines)
        }
    }
}

/// Reads the radio until `stop` is set, publishing into `out`. Runs on the thread that
/// initialised SDL, which on macOS is best kept the main thread.
pub fn run(
    out: watch::Sender<Snapshot>,
    stop: Arc<AtomicBool>,
    profiles: Vec<Profile>,
) -> Result<(), String> {
    // The process has no window, so without this SDL may deliver input only while a window of
    // ours is focused. Signals belong to the runtime that stops the whole process, not to SDL.
    sdl3::hint::set("SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS", "1");
    sdl3::hint::set("SDL_NO_SIGNAL_HANDLERS", "1");

    let sdl = sdl3::init().map_err(|e| e.to_string())?;
    let joysticks = sdl.joystick().map_err(|e| e.to_string())?;
    let mut events = sdl.event_pump().map_err(|e| e.to_string())?;

    let mut probe = Probe::default();
    let mut mapper: Option<Mapper> = None;
    let mut rate = pump::Rate::default();

    while !stop.load(Ordering::Relaxed) {
        pump::until(&mut events, Instant::now() + TICK, |event| match event {
            Event::JoyDeviceAdded { which, .. } => {
                let had_radio = probe.radio().is_some();
                for line in probe.added(&joysticks, which) {
                    println!("station: {line}");
                }
                if !had_radio && probe.radio().is_some() {
                    let (m, lines) = mapper_for(&probe, &profiles);
                    mapper = m;
                    for line in lines {
                        println!("station: {line}");
                    }
                }
            }
            Event::JoyDeviceRemoved { which, .. } => {
                if let Some(line) = probe.removed(which) {
                    mapper = None;
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

        let next = snapshot(&probe, mapper.as_mut(), rate.per_second(Instant::now()));
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
