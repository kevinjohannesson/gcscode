//! radio-probe: opens an EdgeTX radio in USB joystick mode (the TX16S among them) and prints
//! the raw axes, buttons and hats SDL reports for it, live. It reads and sends nothing anywhere.

use std::io::{Write, stdout};
use std::time::{Duration, Instant};

use radio_input::mapping::{self, Mapper, Profile};
use radio_input::probe::{self, Probe};
use radio_input::pump;
use radio_input::recording::{Input, Recorder, Recording, now_ns};
use radio_input::replay;
use radio_probe::panel::{self, Panel};
use radio_probe::{mapped_report, report};
use sdl3::event::Event;

/// How often the live block is redrawn.
const REDRAW: Duration = Duration::from_millis(50);

fn main() {
    if let Err(e) = run() {
        eprintln!("radio-probe: {e}");
        std::process::exit(1);
    }
}

const USAGE: &str =
    "usage: radio-probe [--mapped] [--profile <file>]... [--record <file> | --replay <file>]";

/// What the command line asks for.
struct Args {
    /// The profiles to map with, or none when the probe shows raw values only.
    profiles: Option<Vec<Profile>>,
    /// Where to write a recording of the radio.
    record: Option<String>,
    /// A recording to play instead of reading a real radio.
    replay: Option<(String, Recording)>,
}

/// `--mapped` uses the bundled profiles; each `--profile <file>` adds one, tried before them.
fn args() -> Result<Args, String> {
    let mut mapped = false;
    let mut files = Vec::new();
    let (mut record, mut replay) = (None, None);
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mapped" => mapped = true,
            "--record" => record = Some(args.next().ok_or(USAGE)?),
            "--replay" => {
                let file = args.next().ok_or(USAGE)?;
                let text = std::fs::read_to_string(&file)
                    .map_err(|e| format!("cannot read {file}: {e}"))?;
                let r = Recording::parse(&text)
                    .map_err(|e| format!("recording {file} refused: {e}"))?;
                replay = Some((file, r));
            }
            "--profile" => {
                let file = args.next().ok_or(USAGE)?;
                let text = std::fs::read_to_string(&file)
                    .map_err(|e| format!("cannot read {file}: {e}"))?;
                files.push(
                    Profile::parse(&text).map_err(|e| format!("profile {file} refused: {e}"))?,
                );
                mapped = true;
            }
            _ => return Err(USAGE.to_string()),
        }
    }
    if record.is_some() && replay.is_some() {
        return Err(USAGE.to_string());
    }
    Ok(Args {
        profiles: mapped.then(|| {
            files.extend(Profile::bundled());
            files
        }),
        record,
        replay,
    })
}

fn run() -> Result<(), String> {
    let Args {
        profiles,
        record,
        replay,
    } = args()?;
    let mut recorder = match &record {
        Some(file) => Some(Recorder::new(
            std::fs::File::create(file).map_err(|e| format!("cannot write {file}: {e}"))?,
        )),
        None => None,
    };
    // The radio is open but not yet written: the header waits for SDL's first update.
    let mut unwritten = false;

    // The probe has no window, so without this SDL may deliver input only while a window of
    // ours is focused.
    sdl3::hint::set("SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS", "1");

    let sdl = sdl3::init().map_err(|e| e.to_string())?;
    let joysticks = sdl.joystick().map_err(|e| e.to_string())?;
    let mut events = sdl.event_pump().map_err(|e| e.to_string())?;

    let mut probe = Probe::default();
    let _replaying = match replay {
        Some((file, recording)) => {
            println!("radio-probe: replaying {file}. A real radio is ignored. Ctrl-C quits.");
            probe = Probe::replays_only();
            Some(replay::play_in_real_time(recording, true))
        }
        None => {
            println!(
                "radio-probe: waiting for an EdgeTX radio in USB joystick mode. Ctrl-C quits."
            );
            None
        }
    };
    if let Some(file) = &record {
        println!("radio-probe: recording to {file}");
    }
    let mut mapper: Option<Mapper> = None;
    let mut panel = Panel::default();
    let _cursor = HiddenCursor::new();

    let mut rate = pump::Rate::default();
    let mut quit = false;
    let mut write_failed: Option<std::io::Error> = None;
    let recording = recorder.is_some();

    while !quit {
        let mut handle = |event: Event| match event {
            Event::Quit { .. } => quit = true,
            Event::JoyDeviceAdded { which, .. } => {
                emit(&panel.clear());
                let had_radio = probe.radio().is_some();
                for line in probe.added(&joysticks, which) {
                    println!("{line}");
                }
                if let (false, Some(j), Some(info), Some(profiles)) =
                    (had_radio, probe.radio(), probe.info(), &profiles)
                {
                    let found = mapping::find(
                        profiles,
                        info,
                        j.num_axes() as usize,
                        j.num_buttons() as usize,
                    );
                    match found {
                        Some(p) => println!("  mapped with profile {}", p.name),
                        None => {
                            println!("  {}", mapped_report::NO_PROFILE);
                            for why in mapping::why_none_match(
                                profiles,
                                info,
                                j.num_axes() as usize,
                                j.num_buttons() as usize,
                            ) {
                                println!("    {why}");
                            }
                        }
                    }
                    mapper = found.cloned().map(Mapper::new);
                }
                if !had_radio && probe.radio().is_some() {
                    unwritten = true;
                }
            }
            Event::JoyDeviceRemoved {
                which, timestamp, ..
            } => {
                if let Some(line) = probe.removed(which) {
                    mapper = None;
                    unwritten = false;
                    if let Some(r) = &mut recorder
                        && let Err(e) = r.unplugged(timestamp)
                    {
                        write_failed = Some(e);
                    }
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
                rate.count(Instant::now());
                if let (Some(r), Some((input, at))) = (&mut recorder, Input::of(&event))
                    && let Err(e) = r.event(input, at)
                {
                    write_failed = Some(e);
                }
            }
            _ => {}
        };
        pump::until(&mut events, Instant::now() + REDRAW, &mut handle);
        if recording {
            // Settle only once no event is left, so every queued change is written from its
            // own event first.
            while let Some(event) = events.poll_event() {
                handle(event);
            }
        }
        if let (Some(r), Some(j), Some(info)) = (&mut recorder, probe.radio(), probe.info()) {
            let values = probe::values(j);
            let done = if unwritten {
                unwritten = false;
                r.opened(info, &values, now_ns())
            } else {
                r.settle(&values, now_ns())
            };
            if let Err(e) = done {
                write_failed = Some(e);
            }
        }
        if let Some(e) = write_failed.take() {
            emit(&panel.clear());
            return Err(format!("recording stopped, cannot write: {e}"));
        }

        if let Some(j) = probe.radio() {
            let mut lines = match &mut mapper {
                None => radio_probe::read(j),
                Some(m) => {
                    let v = probe::values(j);
                    let controls = m.update(&v);
                    let mut lines = mapped_report::axes_table(&v.axes, &controls);
                    lines.extend(report::buttons_grid(&v.buttons));
                    lines.extend(mapped_report::controls_lines(&controls));
                    if !v.hats.is_empty() {
                        lines.push(report::hats_line(&v.hats));
                    }
                    lines
                }
            };
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
