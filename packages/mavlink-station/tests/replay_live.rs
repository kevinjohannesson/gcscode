//! A recording played in real time through the station's own `run`, attached from its `ready`
//! hook: no sleep before attaching, and the station ends on the recording's last state. Its
//! own test binary, since SDL is process-global.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use mavlink_station::input;
use mavlink_station::snapshot::Snapshot;
use radio_input::mapping::Profile;
use radio_input::recording::{RadioState, Recording};
use radio_input::replay::play_in_real_time;
use tokio::sync::watch;

#[test]
fn the_running_station_reads_a_recording_played_in_real_time() {
    let text = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/recordings/synthetic-sweep-and-replug.jsonl"
    ))
    .unwrap();
    let recording = Recording::parse(&text).unwrap();
    let last = recording.state_at(recording.end()).unwrap();

    let (tx, rx) = watch::channel(Snapshot::default());
    let stop = Arc::new(AtomicBool::new(false));
    let stopper = stop.clone();
    let length = Duration::from_micros(recording.end()) + Duration::from_millis(500);

    let mut played = None;
    input::run(tx, stop, Profile::bundled(), true, || {
        played = Some(play_in_real_time(recording, true));
        // The station stops half a second after the recording ends, counted from the attach.
        std::thread::spawn(move || {
            std::thread::sleep(length);
            stopper.store(true, Ordering::Relaxed);
        });
    })
    .unwrap();

    let played = played.expect("run never called ready");
    // A player that holds the last values never returns; one that has, failed.
    assert!(
        !played.is_finished(),
        "the player stopped: {:?}",
        played.join()
    );
    let s = rx.borrow().clone();
    let r = s.radio.expect("the station has the replayed radio open");
    assert_eq!(RadioState::new(&r.info, &r.inputs), last);
    assert!(s.controls.is_some(), "the replay maps through its profile");
}
