//! radio-probe: opens an EdgeTX radio in USB joystick mode (the TX16S among them) and prints
//! the raw axes, buttons and hats SDL reports for it, live. It reads and sends nothing anywhere.

use std::io::{Write, stdout};
use std::time::{Duration, Instant};

use radio_probe::mapping::{self, Mapper, Profile};
use radio_probe::panel::{self, Panel};
use radio_probe::probe::{self, Probe};
use radio_probe::{mapped_report, pump, report};
use sdl3::event::Event;

/// How often the live block is redrawn.
const REDRAW: Duration = Duration::from_millis(50);

fn main() {
    if let Err(e) = run() {
        eprintln!("radio-probe: {e}");
        std::process::exit(1);
    }
}

const USAGE: &str = "usage: radio-probe [--mapped] [--profile <file>]...";

/// The profiles to map with, or none when the probe shows raw values only. `--mapped` uses
/// the bundled profiles; each `--profile <file>` adds one, tried before them.
fn profiles() -> Result<Option<Vec<Profile>>, String> {
    let mut mapped = false;
    let mut files = Vec::new();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mapped" => mapped = true,
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
    Ok(mapped.then(|| {
        files.extend(Profile::bundled());
        files
    }))
}

fn run() -> Result<(), String> {
    let profiles = profiles()?;

    // The probe has no window, so without this SDL may deliver input only while a window of
    // ours is focused.
    sdl3::hint::set("SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS", "1");

    let sdl = sdl3::init().map_err(|e| e.to_string())?;
    let joysticks = sdl.joystick().map_err(|e| e.to_string())?;
    let mut events = sdl.event_pump().map_err(|e| e.to_string())?;

    println!("radio-probe: waiting for an EdgeTX radio in USB joystick mode. Ctrl-C quits.");
    let mut probe = Probe::default();
    let mut mapper: Option<Mapper> = None;
    let mut panel = Panel::default();
    let _cursor = HiddenCursor::new();

    let mut rate = pump::Rate::default();
    let mut quit = false;

    while !quit {
        pump::until(&mut events, Instant::now() + REDRAW, |event| match event {
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
            }
            Event::JoyDeviceRemoved { which, .. } => {
                if let Some(line) = probe.removed(which) {
                    mapper = None;
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
            let mut lines = match &mut mapper {
                None => probe::read(j),
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
