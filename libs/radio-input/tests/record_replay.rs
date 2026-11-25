//! A recording replayed through SDL and recorded again comes back the same: every change, in
//! order, and a replug with every value it came back with. The recorder is driven the way
//! `radio-probe --record` drives it. Its own test binary, since SDL is process-global.

use radio_input::probe::{self, Probe};
use radio_input::recording::{Change, Input, Recorder, Recording, now_ns};
use radio_input::replay::Player;
use sdl3::event::Event;

const SOURCE: &str = r#"{"format":"gcscode-radio-recording","version":0,"radio":{"name":"OpenTX TX16SMK3 Joystick","vendorId":4617,"productId":20308,"serial":null,"axes":[0,0,-32768,0],"buttons":[false,false,false],"hats":[0]}}
{"t":4000,"axis":2,"value":-30000}
{"t":8000,"axis":2,"value":-20000}
{"t":8000,"axis":0,"value":1500}
{"t":12000,"button":1,"pressed":true}
{"t":16000,"hat":0,"value":3}
{"t":20000,"button":1,"pressed":false}
{"t":24000,"unplugged":true}
{"t":28000,"plugged":{"name":"OpenTX TX16SMK3 Joystick","vendorId":4617,"productId":20308,"serial":null,"axes":[0,0,12000,0],"buttons":[false,false,true],"hats":[0]}}
{"t":32000,"axis":2,"value":-32768}
"#;

/// What a change says, without its time, which a re-recording cannot keep.
fn what(c: &Change) -> String {
    let mut v = serde_json::to_value(c).unwrap();
    v.as_object_mut().unwrap().remove("t");
    v.to_string()
}

#[test]
fn a_replayed_recording_records_as_it_was() {
    let source = Recording::parse(SOURCE).unwrap();
    let sdl = sdl3::init().unwrap();
    let joysticks = sdl.joystick().unwrap();
    let mut events = sdl.event_pump().unwrap();

    let mut probe = Probe::replays_only();
    let mut recorder = Recorder::new(Vec::new());
    let mut unwritten = false;
    let mut player = Player::new(source.clone());
    player.start().unwrap();

    // One step per instant a change is due, so SDL posts an event for each.
    let mut steps: Vec<u64> = vec![0];
    steps.extend(source.changes.iter().map(Change::t));
    steps.dedup();
    for t in steps {
        player.play_until(t).unwrap();
        while let Some(event) = events.poll_event() {
            match event {
                Event::JoyDeviceAdded { which, .. } => {
                    let had = probe.radio().is_some();
                    probe.added(&joysticks, which);
                    unwritten |= !had && probe.radio().is_some();
                }
                Event::JoyDeviceRemoved {
                    which, timestamp, ..
                } => {
                    if probe.removed(which).is_some() {
                        unwritten = false;
                        recorder.unplugged(timestamp).unwrap();
                    }
                }
                e => {
                    if let Some((input, at)) = Input::of(&e) {
                        recorder.event(input, at).unwrap();
                    }
                }
            }
        }
        if let (Some(j), Some(info)) = (probe.radio(), probe.info()) {
            let values = probe::values(j);
            if unwritten {
                unwritten = false;
                recorder.opened(info, &values, now_ns()).unwrap();
            } else {
                recorder.settle(&values, now_ns()).unwrap();
            }
        }
    }

    let again = Recording::parse(&String::from_utf8(recorder.into_inner()).unwrap()).unwrap();
    assert_eq!(again.radio, source.radio);
    let said = |r: &Recording| r.changes.iter().map(what).collect::<Vec<_>>();
    // Two changes due at the same instant may come back in either order.
    let (mut a, mut b) = (said(&again), said(&source));
    a[1..3].sort();
    b[1..3].sort();
    assert_eq!(a, b);
    let times: Vec<u64> = again.changes.iter().map(Change::t).collect();
    assert!(
        times.windows(2).all(|w| w[0] <= w[1]),
        "times go back: {times:?}"
    );
}
