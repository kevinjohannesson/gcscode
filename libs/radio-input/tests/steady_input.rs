//! A steady stream of events must not hold up the display. Its own test binary, because SDL
//! is process-global and the other test file initialises it too.

use std::time::{Duration, Instant};

use radio_input::pump;

#[test]
fn returns_on_time_while_events_keep_arriving() {
    let sdl = sdl3::init().unwrap();
    let mut events = sdl.event_pump().unwrap();
    let sender = sdl.event().unwrap().event_sender();

    // Stand in for a moving stick: an event every millisecond for 600 ms, from another thread.
    let feeder = std::thread::spawn(move || {
        let end = Instant::now() + Duration::from_millis(600);
        while Instant::now() < end {
            let _ = sender.push_event(sdl3::event::Event::User {
                timestamp: 0,
                window_id: 0,
                type_: sdl3::sys::events::SDL_EVENT_USER.into(),
                code: 0,
                data1: std::ptr::null_mut(),
                data2: std::ptr::null_mut(),
            });
            std::thread::sleep(Duration::from_millis(1));
        }
    });

    std::thread::sleep(Duration::from_millis(20)); // let the stream start
    let start = Instant::now();
    let mut handled = 0;
    pump::until(&mut events, start + Duration::from_millis(50), |_| {
        handled += 1
    });
    let took = start.elapsed();

    assert!(handled > 0, "no events were handled");
    assert!(
        took < Duration::from_millis(150),
        "took {took:?} with events still arriving; the display would wait for the stick to stop"
    );
    feeder.join().unwrap();
}
