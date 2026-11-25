//! Every recording in `tests/recordings/` replayed through the station's own radio side, on a
//! virtual clock: at each 20 ms tick, what the station serves is the recording folded to that
//! instant. Its own test binary, since SDL is process-global.

use std::time::{Duration, Instant};

use mavlink_station::input::{RadioSide, TICK};
use radio_input::mapping::Profile;
use radio_input::recording::{RadioState, Recording};
use radio_input::replay::Player;

fn recordings() -> Vec<(String, Recording)> {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/recordings");
    let mut found: Vec<_> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|x| x == "jsonl"))
        .collect();
    found.sort();
    found
        .into_iter()
        .map(|p| {
            let name = p.file_name().unwrap().to_string_lossy().into_owned();
            let text = std::fs::read_to_string(&p).unwrap();
            let r = Recording::parse(&text).unwrap_or_else(|e| panic!("{name}: {e}"));
            (name, r)
        })
        .collect()
}

#[test]
fn every_recording_reads_through_the_station_as_it_was_recorded() {
    sdl3::hint::set("SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS", "1");
    let sdl = sdl3::init().unwrap();
    let joysticks = sdl.joystick().unwrap();
    let mut events = sdl.event_pump().unwrap();

    let all = recordings();
    assert!(!all.is_empty(), "no recordings in tests/recordings");
    for (name, recording) in all {
        let mut side = RadioSide::new(Profile::bundled(), true);
        let mut player = Player::new(recording.clone());
        player.start().unwrap();
        let t0 = Instant::now();
        let tick = TICK.as_micros() as u64;
        let (mut t, mut ticks, mut unplugged_ticks) = (0, 0, 0);
        while t <= recording.end() + 1_000_000 {
            player.play_until(t).unwrap();
            let now = t0 + Duration::from_micros(t);
            for event in events.poll_iter() {
                side.handle(&joysticks, event, now);
            }
            let s = side.snapshot(now);
            let served = s
                .radio
                .as_ref()
                .map(|r| RadioState::new(&r.info, &r.inputs));
            assert_eq!(served, recording.state_at(t), "{name} at t={t}");
            // The replay keeps the radio's name and USB ID, so its profile maps it.
            assert_eq!(s.controls.is_some(), served.is_some(), "{name} at t={t}");
            if served.is_none() {
                unplugged_ticks += 1;
            }
            ticks += 1;
            t += tick;
        }
        eprintln!("{name}: {ticks} ticks matched, {unplugged_ticks} of them unplugged");
    }
}
