//! Recorded radio sessions: the file format, and the recorder that writes one from what SDL
//! reports. The format is the virtual radio spec's (`docs/specs/2026-11-24-virtual-radio.md`,
//! Goal 2): JSON Lines, a header whose `radio` is the page protocol's `radio` object, then one
//! input change per line.

use std::io::{self, Write};

use serde::{Deserialize, Serialize};

use crate::probe::{Inputs, RadioInfo};

/// The first line's `format`.
pub const FORMAT: &str = "gcscode-radio-recording";
/// The first line's `version`.
pub const VERSION: u32 = 0;

/// Who the radio is and every value it holds at one moment. Field for field the page
/// protocol's `radio` object, so a recording's header can be served as it is.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RadioState {
    pub name: String,
    pub vendor_id: u16,
    pub product_id: u16,
    /// Always `null` in a recording: recordings are committed to a public repo, and SDL's
    /// virtual joysticks have no serial to replay one with.
    pub serial: Option<String>,
    pub axes: Vec<i16>,
    pub buttons: Vec<bool>,
    pub hats: Vec<u8>,
}

impl RadioState {
    /// The state of an open radio, with its serial left out.
    pub fn new(info: &RadioInfo, inputs: &Inputs) -> Self {
        RadioState {
            name: info.name.clone(),
            vendor_id: info.vendor,
            product_id: info.product,
            serial: None,
            axes: inputs.axes.clone(),
            buttons: inputs.buttons.clone(),
            hats: inputs.hats.clone(),
        }
    }

    pub fn inputs(&self) -> Inputs {
        Inputs {
            axes: self.axes.clone(),
            buttons: self.buttons.clone(),
            hats: self.hats.clone(),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Header {
    format: String,
    version: u32,
    radio: RadioState,
}

/// One line after the header. `t` is microseconds since recording started.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Change {
    Axis {
        t: u64,
        axis: u8,
        value: i16,
    },
    Button {
        t: u64,
        button: u8,
        pressed: bool,
    },
    Hat {
        t: u64,
        hat: u8,
        value: u8,
    },
    /// The radio left. Always written as `"unplugged":true`.
    Unplugged {
        t: u64,
        unplugged: bool,
    },
    /// The radio came back, with every value it held then, read after SDL's first update.
    Plugged {
        t: u64,
        plugged: RadioState,
    },
}

impl Change {
    pub fn t(&self) -> u64 {
        match self {
            Change::Axis { t, .. }
            | Change::Button { t, .. }
            | Change::Hat { t, .. }
            | Change::Unplugged { t, .. }
            | Change::Plugged { t, .. } => *t,
        }
    }
}

/// A whole recorded session.
#[derive(Clone, Debug, PartialEq)]
pub struct Recording {
    /// The radio as it was when recording started.
    pub radio: RadioState,
    pub changes: Vec<Change>,
}

impl Recording {
    /// Reads a recording, refusing one that could not have been recorded: another format or
    /// version, a time that goes backwards, an input the radio does not have, or a change
    /// while the radio is unplugged.
    pub fn parse(text: &str) -> Result<Recording, String> {
        let mut lines = text
            .lines()
            .enumerate()
            .filter(|(_, l)| !l.trim().is_empty());
        let (_, first) = lines.next().ok_or("empty recording")?;
        let header: Header =
            serde_json::from_str(first).map_err(|e| format!("line 1: not a header: {e}"))?;
        if header.format != FORMAT {
            return Err(format!(
                "line 1: format is {:?}, not {FORMAT:?}",
                header.format
            ));
        }
        if header.version != VERSION {
            return Err(format!(
                "line 1: version {} (this reads {VERSION})",
                header.version
            ));
        }
        let mut changes = Vec::new();
        let mut current = Some(header.radio.clone());
        let mut last_t = 0;
        for (i, line) in lines {
            let n = i + 1;
            let change: Change =
                serde_json::from_str(line).map_err(|e| format!("line {n}: {e}"))?;
            if change.t() < last_t {
                return Err(format!("line {n}: t {} is before {last_t}", change.t()));
            }
            last_t = change.t();
            apply(&mut current, &change).map_err(|e| format!("line {n}: {e}"))?;
            changes.push(change);
        }
        Ok(Recording {
            radio: header.radio,
            changes,
        })
    }

    /// The recording as JSON Lines, one line per header and change.
    pub fn to_jsonl(&self) -> String {
        let mut out = header_line(&self.radio);
        for c in &self.changes {
            out.push_str(&change_line(c));
        }
        out
    }

    /// The radio at `t`, folded straight from the recording, or `None` while it is
    /// unplugged: what any replay of it must read at that instant.
    pub fn state_at(&self, t: u64) -> Option<RadioState> {
        let mut state = Some(self.radio.clone());
        for c in self.changes.iter().take_while(|c| c.t() <= t) {
            apply(&mut state, c).expect("a parsed recording folds");
        }
        state
    }

    /// The time of the last change, 0 when there is none.
    pub fn end(&self) -> u64 {
        self.changes.last().map(Change::t).unwrap_or(0)
    }
}

/// Folds one change into the radio's state.
fn apply(state: &mut Option<RadioState>, change: &Change) -> Result<(), String> {
    match (state.as_mut(), change) {
        (None, Change::Plugged { plugged, .. }) => {
            *state = Some(plugged.clone());
            Ok(())
        }
        (None, _) => Err("a change while the radio is unplugged".into()),
        (Some(_), Change::Plugged { .. }) => Err("plugged while the radio is plugged in".into()),
        (Some(_), Change::Unplugged { unplugged, .. }) => {
            if !unplugged {
                return Err("\"unplugged\" is always true".into());
            }
            *state = None;
            Ok(())
        }
        (Some(s), Change::Axis { axis, value, .. }) => {
            *s.axes
                .get_mut(*axis as usize)
                .ok_or(format!("no axis {axis}"))? = *value;
            Ok(())
        }
        (
            Some(s),
            Change::Button {
                button, pressed, ..
            },
        ) => {
            *s.buttons
                .get_mut(*button as usize)
                .ok_or(format!("no button {button}"))? = *pressed;
            Ok(())
        }
        (Some(s), Change::Hat { hat, value, .. }) => {
            *s.hats
                .get_mut(*hat as usize)
                .ok_or(format!("no hat {hat}"))? = *value;
            Ok(())
        }
    }
}

fn header_line(radio: &RadioState) -> String {
    let header = Header {
        format: FORMAT.into(),
        version: VERSION,
        radio: radio.clone(),
    };
    serde_json::to_string(&header).expect("a header always serialises") + "\n"
}

fn change_line(c: &Change) -> String {
    serde_json::to_string(c).expect("a change always serialises") + "\n"
}

/// One input change as SDL's event reports it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Input {
    Axis(u8, i16),
    Button(u8, bool),
    Hat(u8, u8),
}

impl Input {
    /// The change an SDL joystick input event carries, with its timestamp in nanoseconds.
    pub fn of(event: &sdl3::event::Event) -> Option<(Input, u64)> {
        use sdl3::event::Event;
        match *event {
            Event::JoyAxisMotion {
                timestamp,
                axis_idx,
                value,
                ..
            } => Some((Input::Axis(axis_idx, value), timestamp)),
            Event::JoyButtonDown {
                timestamp,
                button_idx,
                ..
            } => Some((Input::Button(button_idx, true), timestamp)),
            Event::JoyButtonUp {
                timestamp,
                button_idx,
                ..
            } => Some((Input::Button(button_idx, false), timestamp)),
            Event::JoyHatMotion {
                timestamp,
                hat_idx,
                state,
                ..
            } => Some((Input::Hat(hat_idx, state.to_raw()), timestamp)),
            _ => None,
        }
    }
}

/// SDL's clock in nanoseconds, the one it stamps its events with.
pub fn now_ns() -> u64 {
    // SAFETY: a plain getter.
    unsafe { sdl3::sys::timer::SDL_GetTicksNS() }
}

/// Writes a recording as the radio is read. Times are SDL's nanosecond ticks
/// (`SDL_GetTicksNS`, the clock SDL stamps its events with).
///
/// The caller hands it every input event of the open radio with [`Recorder::event`], and once
/// no joystick event is left in SDL's queue it hands it every value with [`Recorder::settle`].
/// An event's change is written from the event itself, with its own timestamp: on Linux SDL
/// applies every queued kernel event in one update, so the values read at an event can already
/// hold later ones. `settle` writes whatever SDL changed without an event, such as the first
/// axis values of a real radio just opened, which SDL keeps to itself until the axis moves.
///
/// Changes wait until `settle` to be written, because when a radio is unplugged SDL first
/// posts events re-centring every input (each axis to the value it opened with, buttons up,
/// hats centred), all stamped with one time just before the removal's
/// (`SDL_PrivateJoystickForceRecentering` in SDL 3.4.20's `src/joystick/SDL_joystick.c`).
/// Those are not the radio's: [`Recorder::unplugged`] drops the waiting changes of that kind
/// stamped less than [`RECENTRE_WINDOW_NS`] before the removal, so a replay goes from the
/// radio's last values straight to unplugged.
pub struct Recorder<W: Write> {
    out: W,
    start_ns: Option<u64>,
    last: Option<RadioState>,
    waiting: Vec<(Change, u64)>,
}

/// How close before a removal a change must be stamped to count as SDL's re-centring. SDL
/// stamps them microseconds before the removal; a radio reports about once a millisecond.
pub const RECENTRE_WINDOW_NS: u64 = 1_000_000;

impl<W: Write> Recorder<W> {
    pub fn new(out: W) -> Self {
        Recorder {
            out,
            start_ns: None,
            last: None,
            waiting: Vec::new(),
        }
    }

    fn t(&self, ns: u64) -> u64 {
        ns.saturating_sub(self.start_ns.unwrap_or(ns)) / 1000
    }

    fn write(&mut self, line: &str) -> io::Result<()> {
        self.out.write_all(line.as_bytes())?;
        self.out.flush()
    }

    /// The radio was opened. The first time starts the recording with its header; after an
    /// unplug, it writes `plugged` with every value.
    pub fn opened(&mut self, info: &RadioInfo, inputs: &Inputs, now_ns: u64) -> io::Result<()> {
        let state = RadioState::new(info, inputs);
        let line = match self.start_ns {
            None => {
                self.start_ns = Some(now_ns);
                header_line(&state)
            }
            Some(_) => change_line(&Change::Plugged {
                t: self.t(now_ns),
                plugged: state.clone(),
            }),
        };
        self.last = Some(state);
        self.write(&line)
    }

    /// The radio went away; `removed_ns` is the removal event's timestamp.
    pub fn unplugged(&mut self, removed_ns: u64) -> io::Result<()> {
        if self.last.take().is_none() {
            return Ok(());
        }
        self.waiting.retain(|(c, ns)| {
            !(removed_ns.saturating_sub(*ns) < RECENTRE_WINDOW_NS && recentres(c))
        });
        self.flush()?;
        let line = change_line(&Change::Unplugged {
            t: self.t(removed_ns),
            unplugged: true,
        });
        self.write(&line)
    }

    fn flush(&mut self) -> io::Result<()> {
        let lines: String = self
            .waiting
            .drain(..)
            .map(|(c, _)| change_line(&c))
            .collect();
        if lines.is_empty() {
            return Ok(());
        }
        self.write(&lines)
    }

    /// One input event of the open radio. Writes nothing when the value is the one already
    /// written.
    pub fn event(&mut self, input: Input, event_ns: u64) -> io::Result<()> {
        let t = self.t(event_ns);
        let Some(last) = self.last.as_mut() else {
            return Ok(());
        };
        let change = match input {
            Input::Axis(i, v) => slot(&mut last.axes, i, v).then_some(Change::Axis {
                t,
                axis: i,
                value: v,
            }),
            Input::Button(i, v) => slot(&mut last.buttons, i, v).then_some(Change::Button {
                t,
                button: i,
                pressed: v,
            }),
            Input::Hat(i, v) => slot(&mut last.hats, i, v).then_some(Change::Hat {
                t,
                hat: i,
                value: v,
            }),
        };
        self.waiting.extend(change.map(|c| (c, event_ns)));
        Ok(())
    }

    /// Every value of the open radio, once no joystick event is left in the queue. Writes the
    /// changes the events brought, then each value that differs from them, at `now_ns`.
    pub fn settle(&mut self, inputs: &Inputs, now_ns: u64) -> io::Result<()> {
        let Some(last) = self.last.as_ref() else {
            return Ok(());
        };
        let mut found = Vec::new();
        for (i, v) in inputs.axes.iter().enumerate() {
            if last.axes.get(i) != Some(v) {
                found.push(Input::Axis(i as u8, *v));
            }
        }
        for (i, v) in inputs.buttons.iter().enumerate() {
            if last.buttons.get(i) != Some(v) {
                found.push(Input::Button(i as u8, *v));
            }
        }
        for (i, v) in inputs.hats.iter().enumerate() {
            if last.hats.get(i) != Some(v) {
                found.push(Input::Hat(i as u8, *v));
            }
        }
        for input in found {
            self.event(input, now_ns)?;
        }
        self.flush()
    }

    pub fn into_inner(self) -> W {
        self.out
    }
}

/// Whether a change is of the kind SDL's re-centring sends: any axis (to the value it opened
/// with, which the recorder does not know), a button let go, a hat centred.
fn recentres(c: &Change) -> bool {
    matches!(
        c,
        Change::Axis { .. } | Change::Button { pressed: false, .. } | Change::Hat { value: 0, .. }
    )
}

/// Stores `v` at `i` and says whether it changed anything. An index the radio lacks changes
/// nothing.
fn slot<T: PartialEq + Copy>(values: &mut [T], i: u8, v: T) -> bool {
    match values.get_mut(i as usize) {
        Some(old) if *old != v => {
            *old = v;
            true
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info() -> RadioInfo {
        RadioInfo {
            name: "TX16SMK3 Joystick".into(),
            vendor: 0x1209,
            product: 0x4F54,
            serial: Some("0123456789AB".into()),
        }
    }

    fn inputs(axes: &[i16], buttons: &[bool]) -> Inputs {
        Inputs {
            axes: axes.to_vec(),
            buttons: buttons.to_vec(),
            hats: vec![0],
        }
    }

    const HEADER: &str = r#"{"format":"gcscode-radio-recording","version":0,"radio":{"name":"TX16SMK3 Joystick","vendorId":4617,"productId":20308,"serial":null,"axes":[0,-32768],"buttons":[false,false],"hats":[0]}}"#;

    fn recorded(f: impl FnOnce(&mut Recorder<Vec<u8>>)) -> Vec<String> {
        let mut r = Recorder::new(Vec::new());
        r.opened(&info(), &inputs(&[0, -32768], &[false, false]), 5_000_000)
            .unwrap();
        f(&mut r);
        String::from_utf8(r.into_inner())
            .unwrap()
            .lines()
            .map(String::from)
            .collect()
    }

    #[test]
    fn the_header_is_the_page_protocols_radio_without_its_serial() {
        assert_eq!(recorded(|_| {}), vec![HEADER]);
    }

    #[test]
    fn an_event_is_written_from_the_event_with_its_own_time() {
        let lines = recorded(|r| {
            r.event(Input::Axis(1, -100), 5_004_000).unwrap();
            r.event(Input::Button(1, true), 6_000_000).unwrap();
            r.event(Input::Hat(0, 3), 6_500_999).unwrap();
            let mut now = inputs(&[0, -100], &[false, true]);
            now.hats = vec![3];
            r.settle(&now, 6_600_000).unwrap();
        });
        assert_eq!(
            lines[1..],
            [
                r#"{"t":4,"axis":1,"value":-100}"#,
                r#"{"t":1000,"button":1,"pressed":true}"#,
                r#"{"t":1500,"hat":0,"value":3}"#,
            ]
        );
    }

    #[test]
    fn one_update_that_moves_an_axis_twice_keeps_both_changes() {
        // On Linux SDL applies a whole batch of kernel events in one update, so by the time
        // the first event is handled the values already hold the last one. Settling then
        // finds nothing new.
        let lines = recorded(|r| {
            r.event(Input::Axis(0, 100), 5_001_000).unwrap();
            r.event(Input::Axis(0, 200), 5_002_000).unwrap();
            r.settle(&inputs(&[200, -32768], &[false, false]), 5_003_000)
                .unwrap();
        });
        assert_eq!(
            lines[1..],
            [
                r#"{"t":1,"axis":0,"value":100}"#,
                r#"{"t":2,"axis":0,"value":200}"#,
            ]
        );
    }

    #[test]
    fn a_value_changed_without_an_event_is_written_when_settling() {
        let lines = recorded(|r| {
            r.settle(&inputs(&[12000, -32768], &[false, true]), 5_020_000)
                .unwrap();
            r.settle(&inputs(&[12000, -32768], &[false, true]), 5_040_000)
                .unwrap();
        });
        assert_eq!(
            lines[1..],
            [
                r#"{"t":20,"axis":0,"value":12000}"#,
                r#"{"t":20,"button":1,"pressed":true}"#,
            ]
        );
    }

    #[test]
    fn a_replug_writes_every_value_it_came_back_with() {
        let lines = recorded(|r| {
            // SDL re-centres every input before it reports the removal; only the move that
            // was the radio's own is kept.
            r.event(Input::Axis(1, 300), 5_900_000).unwrap();
            r.event(Input::Axis(1, -32768), 6_999_990).unwrap();
            r.event(Input::Button(0, false), 6_999_990).unwrap();
            r.unplugged(7_000_000).unwrap();
            r.unplugged(7_100_000).unwrap(); // a second removal says nothing
            r.event(Input::Axis(0, 5), 7_200_000).unwrap(); // nothing open: nothing written
            r.opened(&info(), &inputs(&[0, 9000], &[true, false]), 8_000_000)
                .unwrap();
        });
        assert_eq!(
            lines[1..],
            [
                r#"{"t":900,"axis":1,"value":300}"#,
                r#"{"t":2000,"unplugged":true}"#,
                r#"{"t":3000,"plugged":{"name":"TX16SMK3 Joystick","vendorId":4617,"productId":20308,"serial":null,"axes":[0,9000],"buttons":[true,false],"hats":[0]}}"#,
            ]
        );
    }

    #[test]
    fn a_recording_folds_to_its_state_at_any_instant() {
        let text = [
            HEADER,
            r#"{"t":10,"axis":0,"value":500}"#,
            r#"{"t":20,"button":1,"pressed":true}"#,
            r#"{"t":30,"unplugged":true}"#,
            r#"{"t":40,"plugged":{"name":"TX16SMK3 Joystick","vendorId":4617,"productId":20308,"serial":null,"axes":[7,8],"buttons":[true,true],"hats":[4]}}"#,
            r#"{"t":40,"hat":0,"value":1}"#,
        ]
        .join("\n");
        let r = Recording::parse(&text).unwrap();
        assert_eq!(r.end(), 40);
        assert_eq!(r.to_jsonl(), text.clone() + "\n");
        let at = |t| r.state_at(t).map(|s| (s.axes, s.buttons, s.hats));
        assert_eq!(at(0), Some((vec![0, -32768], vec![false, false], vec![0])));
        assert_eq!(
            at(10),
            Some((vec![500, -32768], vec![false, false], vec![0]))
        );
        assert_eq!(
            at(29),
            Some((vec![500, -32768], vec![false, true], vec![0]))
        );
        assert_eq!(at(30), None);
        assert_eq!(at(39), None);
        assert_eq!(at(40), Some((vec![7, 8], vec![true, true], vec![1])));
    }

    #[test]
    fn a_recording_that_could_not_have_happened_is_refused() {
        let with = |line: &str| Recording::parse(&format!("{HEADER}\n{line}")).unwrap_err();
        assert_eq!(with(r#"{"t":1,"axis":2,"value":0}"#), "line 2: no axis 2");
        assert_eq!(
            with(r#"{"t":1,"button":2,"pressed":true}"#),
            "line 2: no button 2"
        );
        assert_eq!(with(r#"{"t":1,"hat":1,"value":0}"#), "line 2: no hat 1");
        assert_eq!(
            with(r#"{"t":1,"unplugged":false}"#),
            "line 2: \"unplugged\" is always true"
        );
        assert_eq!(
            with("{\"t\":5,\"axis\":0,\"value\":1}\n{\"t\":4,\"axis\":0,\"value\":2}"),
            "line 3: t 4 is before 5"
        );
        assert_eq!(
            with("{\"t\":1,\"unplugged\":true}\n{\"t\":2,\"axis\":0,\"value\":2}"),
            "line 3: a change while the radio is unplugged"
        );
        assert!(with(r#"{"t":1,"plugged":{"name":"x","vendorId":1,"productId":2,"serial":null,"axes":[],"buttons":[],"hats":[]}}"#)
            .starts_with("line 2: plugged while"));
        assert!(
            Recording::parse(&HEADER.replace("version\":0", "version\":1"))
                .unwrap_err()
                .starts_with("line 1: version 1")
        );
        assert!(
            Recording::parse(&HEADER.replace("gcscode-radio-recording", "other"))
                .unwrap_err()
                .starts_with("line 1: format")
        );
        assert_eq!(Recording::parse("").unwrap_err(), "empty recording");
    }
}
