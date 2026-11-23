//! Taking SDL's events without letting a steady stream of them hold up the display.

use std::time::Instant;

use sdl3::EventPump;
use sdl3::event::Event;

/// Hands every event that arrives to `handle` until `until`, then returns, however many events
/// are still coming. A radio sends an axis event about every millisecond while a stick moves,
/// so a loop that waits for the queue to go quiet would not redraw until the stick stops.
pub fn until(events: &mut EventPump, until: Instant, mut handle: impl FnMut(Event)) {
    loop {
        let now = Instant::now();
        if now >= until {
            return;
        }
        if let Some(event) = events.wait_event_timeout(until - now) {
            handle(event);
        }
    }
}

/// Counts events over whole seconds, so the display can show how often the radio reports.
#[derive(Default)]
pub struct Rate {
    started: Option<Instant>,
    counting: u32,
    last: Option<u32>,
}

impl Rate {
    pub fn count(&mut self, now: Instant) {
        self.roll(now);
        self.counting += 1;
    }

    /// Events in the last whole second, once one has passed since the first event.
    pub fn per_second(&mut self, now: Instant) -> Option<u32> {
        self.roll(now);
        self.last
    }

    fn roll(&mut self, now: Instant) {
        let started = *self.started.get_or_insert(now);
        let elapsed = now.duration_since(started).as_secs();
        if elapsed >= 1 {
            // A second with no events at all is reported as 0, not as the last busy second.
            self.last = Some(if elapsed == 1 { self.counting } else { 0 });
            self.counting = 0;
            self.started = Some(started + std::time::Duration::from_secs(elapsed));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn rate_reports_whole_seconds() {
        let t0 = Instant::now();
        let mut r = Rate::default();
        assert_eq!(r.per_second(t0), None);
        for ms in 0..250 {
            r.count(t0 + Duration::from_millis(ms * 4)); // every 4 ms for one second
        }
        assert_eq!(r.per_second(t0 + Duration::from_millis(999)), None);
        assert_eq!(r.per_second(t0 + Duration::from_millis(1000)), Some(250));
        r.count(t0 + Duration::from_millis(1500));
        assert_eq!(r.per_second(t0 + Duration::from_millis(1999)), Some(250));
        assert_eq!(r.per_second(t0 + Duration::from_millis(2000)), Some(1));
        // One event in the next second, then none in the one after: the last whole second
        // had nothing, whatever the one before it held.
        r.count(t0 + Duration::from_millis(2500));
        assert_eq!(r.per_second(t0 + Duration::from_millis(4100)), Some(0));
    }
}
