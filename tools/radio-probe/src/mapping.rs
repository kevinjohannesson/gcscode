//! What each radio input means to gcscode: a profile file names, for one radio set up one
//! way, which axis drives each of a fixed list of controls and how it is calibrated, which
//! held button is each on/off control, and which buttons together make one switch with named
//! positions. A [`Mapper`] turns raw [`Inputs`] into those [`Controls`]. It reads only.
//!
//! The vocabulary is fixed here; which input drives which control is the profile's data, so
//! nothing downstream depends on one radio or one radio setup.

use std::collections::BTreeSet;

use serde::Deserialize;

use crate::probe::{Inputs, RadioInfo};

/// The controls an axis can drive, in the order they are shown.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AxisRole {
    Roll,
    Pitch,
    Throttle,
    Yaw,
    Aux1,
    Aux2,
    Aux3,
    Aux4,
}

impl AxisRole {
    pub const ALL: [AxisRole; 8] = [
        AxisRole::Roll,
        AxisRole::Pitch,
        AxisRole::Throttle,
        AxisRole::Yaw,
        AxisRole::Aux1,
        AxisRole::Aux2,
        AxisRole::Aux3,
        AxisRole::Aux4,
    ];

    /// The key a profile and the page protocol use.
    pub fn id(self) -> &'static str {
        match self {
            AxisRole::Roll => "roll",
            AxisRole::Pitch => "pitch",
            AxisRole::Throttle => "throttle",
            AxisRole::Yaw => "yaw",
            AxisRole::Aux1 => "aux1",
            AxisRole::Aux2 => "aux2",
            AxisRole::Aux3 => "aux3",
            AxisRole::Aux4 => "aux4",
        }
    }

    /// What an operator reads.
    pub fn label(self) -> &'static str {
        match self {
            AxisRole::Roll => "roll",
            AxisRole::Pitch => "pitch",
            AxisRole::Throttle => "throttle",
            AxisRole::Yaw => "yaw",
            AxisRole::Aux1 => "aux 1",
            AxisRole::Aux2 => "aux 2",
            AxisRole::Aux3 => "aux 3",
            AxisRole::Aux4 => "aux 4",
        }
    }

    /// Throttle reads 0% to 100%; every other axis -100% to 100%, 0% at its centre.
    pub fn one_sided(self) -> bool {
        self == AxisRole::Throttle
    }
}

/// The on/off controls, in the order they are shown.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OnOffRole {
    /// Whether gcscode has control. Later rungs send only while it is on.
    Control,
    /// Return to launch while held.
    Rtl,
}

impl OnOffRole {
    pub const ALL: [OnOffRole; 2] = [OnOffRole::Control, OnOffRole::Rtl];

    pub fn id(self) -> &'static str {
        match self {
            OnOffRole::Control => "control",
            OnOffRole::Rtl => "rtl",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            OnOffRole::Control => "control",
            OnOffRole::Rtl => "RTL",
        }
    }
}

/// How one axis is calibrated, in SDL's raw units (-32768 to 32767). `min` is the raw value
/// at -100% (0% for throttle) and `max` at 100%, so a reversed axis has `min` above `max`.
/// Within `deadband` of `centre` the axis reads 0% (50% for throttle).
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Axis {
    pub axis: usize,
    pub min: i32,
    pub centre: i32,
    pub max: i32,
    #[serde(default)]
    pub deadband: i32,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Axes {
    pub roll: Option<Axis>,
    pub pitch: Option<Axis>,
    pub throttle: Option<Axis>,
    pub yaw: Option<Axis>,
    pub aux1: Option<Axis>,
    pub aux2: Option<Axis>,
    pub aux3: Option<Axis>,
    pub aux4: Option<Axis>,
}

impl Axes {
    pub fn get(&self, role: AxisRole) -> Option<&Axis> {
        match role {
            AxisRole::Roll => self.roll.as_ref(),
            AxisRole::Pitch => self.pitch.as_ref(),
            AxisRole::Throttle => self.throttle.as_ref(),
            AxisRole::Yaw => self.yaw.as_ref(),
            AxisRole::Aux1 => self.aux1.as_ref(),
            AxisRole::Aux2 => self.aux2.as_ref(),
            AxisRole::Aux3 => self.aux3.as_ref(),
            AxisRole::Aux4 => self.aux4.as_ref(),
        }
    }
}

/// What an on/off control is read from. Only a held button is accepted; a switch position
/// can be written, so that a profile asking for it is refused with a reason rather than a
/// parse error.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(untagged, deny_unknown_fields)]
pub enum OnOffSource {
    Button { button: usize },
    SwitchPosition { switch: String, position: String },
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct OnOff {
    pub control: Option<OnOffSource>,
    pub rtl: Option<OnOffSource>,
}

impl OnOff {
    pub fn get(&self, role: OnOffRole) -> Option<&OnOffSource> {
        match role {
            OnOffRole::Control => self.control.as_ref(),
            OnOffRole::Rtl => self.rtl.as_ref(),
        }
    }
}

/// A switch that EdgeTX reports in Pulse mode: one button per position, pressed for 0.2 s
/// when the switch moves there. `positions[i]` names the position of `buttons[i]`.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Switch {
    pub name: String,
    pub buttons: Vec<usize>,
    pub positions: Vec<String>,
}

/// Which radio a profile is for. USB ids must match, and the joystick's name must contain
/// `name`: SDL builds the name from the USB strings and may put the manufacturer first, so
/// the TX16S reads `TX16SMK3 Joystick` in one place and `OpenTX TX16SMK3 Joystick` in
/// another. `axes` and `buttons`, when given, must match the radio's counts too, which
/// tells two models of one radio apart.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Match {
    pub vendor: u16,
    pub product: u16,
    pub name: String,
    pub axes: Option<usize>,
    pub buttons: Option<usize>,
}

/// One profile file, checked: [`Profile::parse`] refuses one that breaks a rule.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    pub name: String,
    #[serde(rename = "match")]
    pub matches: Match,
    #[serde(default)]
    pub axes: Axes,
    #[serde(default, rename = "on-off")]
    pub on_off: OnOff,
    #[serde(default)]
    pub switches: Vec<Switch>,
}

/// The profiles that ship with gcscode, compiled in.
pub const BUNDLED: [(&str, &str); 1] = [(
    "profiles/gcscode-adv.toml",
    include_str!("../profiles/gcscode-adv.toml"),
)];

impl Profile {
    /// Reads a profile and checks it. The error says what is wrong in one line.
    pub fn parse(text: &str) -> Result<Profile, String> {
        let p: Profile = toml::from_str(text).map_err(|e| e.message().to_string())?;
        p.check()?;
        Ok(p)
    }

    /// Every profile in [`BUNDLED`]. A bundled profile that does not load is a build defect,
    /// which the tests catch.
    pub fn bundled() -> Vec<Profile> {
        BUNDLED
            .iter()
            .map(|(file, text)| {
                Profile::parse(text).unwrap_or_else(|e| panic!("bundled {file} refused: {e}"))
            })
            .collect()
    }

    fn check(&self) -> Result<(), String> {
        if self.name.trim().is_empty() {
            return Err("the profile has no name".into());
        }
        if self.matches.name.trim().is_empty() {
            // Every name contains the empty text, so this would match any radio with these ids.
            return Err("[match] needs the joystick's name, or part of it".into());
        }

        let mut axes_used = BTreeSet::new();
        for role in AxisRole::ALL {
            let Some(a) = self.axes.get(role) else {
                continue;
            };
            let r = role.id();
            if !axes_used.insert(a.axis) {
                return Err(format!("axis {} drives more than one control", a.axis));
            }
            for (what, v) in [("min", a.min), ("centre", a.centre), ("max", a.max)] {
                if !(-32768..=32767).contains(&v) {
                    return Err(format!("{r}: {what} {v} is outside -32768 to 32767"));
                }
            }
            let between =
                (a.min < a.centre && a.centre < a.max) || (a.max < a.centre && a.centre < a.min);
            if !between {
                return Err(format!("{r}: centre must lie between min and max"));
            }
            let shorter = (a.max - a.centre).abs().min((a.centre - a.min).abs());
            if a.deadband < 0 || a.deadband >= shorter {
                return Err(format!(
                    "{r}: deadband must be at least 0 and less than {shorter}, the distance from centre to the nearer end"
                ));
            }
            if self.matches.axes.is_some_and(|n| a.axis >= n) {
                return Err(format!("{r}: axis {} is beyond the radio's axes", a.axis));
            }
        }

        let mut buttons_used = BTreeSet::new();
        let mut switch_names = BTreeSet::new();
        for s in &self.switches {
            if s.name.trim().is_empty() {
                return Err("a switch has no name".into());
            }
            if !switch_names.insert(s.name.as_str()) {
                return Err(format!("switch {} is named twice", s.name));
            }
            if s.buttons.len() < 2 || s.buttons.len() != s.positions.len() {
                return Err(format!(
                    "switch {}: needs one position name per button, and at least two",
                    s.name
                ));
            }
            let mut names = BTreeSet::new();
            for p in &s.positions {
                if p.trim().is_empty() || !names.insert(p.as_str()) {
                    return Err(format!(
                        "switch {}: position names must be non-empty and different",
                        s.name
                    ));
                }
            }
            for &b in &s.buttons {
                self.claim_button(&mut buttons_used, b, &format!("switch {}", s.name))?;
            }
        }

        for role in OnOffRole::ALL {
            let Some(source) = self.on_off.get(role) else {
                continue;
            };
            let r = role.id();
            match source {
                OnOffSource::SwitchPosition { .. } => {
                    return Err(format!(
                        "{r} may only map to a held button (`{r} = {{ button = N }}`), not a switch position: a Pulse switch's position is lost whenever a press is missed"
                    ));
                }
                OnOffSource::Button { button } => {
                    if let Some(s) = self.switches.iter().find(|s| s.buttons.contains(button)) {
                        return Err(format!(
                            "{r} may only map to a held button, and button {button} is a Pulse button of switch {}",
                            s.name
                        ));
                    }
                    self.claim_button(&mut buttons_used, *button, r)?;
                }
            }
        }
        Ok(())
    }

    fn claim_button(&self, used: &mut BTreeSet<usize>, b: usize, by: &str) -> Result<(), String> {
        if self.matches.buttons.is_some_and(|n| b >= n) {
            return Err(format!("{by}: button {b} is beyond the radio's buttons"));
        }
        if !used.insert(b) {
            return Err(format!("button {b} is mapped more than once"));
        }
        Ok(())
    }

    /// Whether this profile is for this radio, as it reports itself now.
    pub fn matches(&self, info: &RadioInfo, axes: usize, buttons: usize) -> bool {
        self.mismatches(info, axes, buttons).is_empty()
    }

    /// What this profile expects that the radio is not, one phrase each, such as
    /// `28 buttons, the radio has 24`. Empty when the profile is for this radio.
    pub fn mismatches(&self, info: &RadioInfo, axes: usize, buttons: usize) -> Vec<String> {
        let m = &self.matches;
        let mut out = Vec::new();
        if (m.vendor, m.product) != (info.vendor, info.product) {
            out.push(format!(
                "USB id {:04x}:{:04x}, the radio is {:04x}:{:04x}",
                m.vendor, m.product, info.vendor, info.product
            ));
        }
        let name = m.name.trim();
        if !info.name.contains(name) {
            out.push(format!(
                "a name containing \"{name}\", the radio is \"{}\"",
                info.name
            ));
        }
        match (m.axes, self.highest_axis()) {
            (Some(n), _) if n != axes => out.push(format!("{n} axes, the radio has {axes}")),
            (None, Some(a)) if a >= axes => out.push(format!(
                "at least {} axes (it reads axis {a}), the radio has {axes}",
                a + 1
            )),
            _ => {}
        }
        match (m.buttons, self.highest_button()) {
            (Some(n), _) if n != buttons => {
                out.push(format!("{n} buttons, the radio has {buttons}"))
            }
            (None, Some(b)) if b >= buttons => out.push(format!(
                "at least {} buttons (it reads button {b}), the radio has {buttons}",
                b + 1
            )),
            _ => {}
        }
        out
    }

    fn highest_axis(&self) -> Option<usize> {
        AxisRole::ALL
            .iter()
            .filter_map(|r| self.axes.get(*r).map(|a| a.axis))
            .max()
    }

    fn highest_button(&self) -> Option<usize> {
        let held = OnOffRole::ALL
            .iter()
            .filter_map(|r| match self.on_off.get(*r) {
                Some(OnOffSource::Button { button }) => Some(*button),
                _ => None,
            });
        self.switches
            .iter()
            .flat_map(|s| s.buttons.iter().copied())
            .chain(held)
            .max()
    }
}

/// Why no profile is for this radio: one line per profile, naming what it expects that the
/// radio is not, so a mismatch shows at a glance.
pub fn why_none_match(
    profiles: &[Profile],
    info: &RadioInfo,
    axes: usize,
    buttons: usize,
) -> Vec<String> {
    profiles
        .iter()
        .map(|p| {
            format!(
                "profile {} expects {}",
                p.name,
                p.mismatches(info, axes, buttons).join("; ")
            )
        })
        .collect()
}

/// The first profile that matches the radio, in the order given.
pub fn find<'a>(
    profiles: &'a [Profile],
    info: &RadioInfo,
    axes: usize,
    buttons: usize,
) -> Option<&'a Profile> {
    profiles.iter().find(|p| p.matches(info, axes, buttons))
}

/// Where a calibrated axis is, from -1.0 to 1.0 with 0.0 at its centre. Within the deadband
/// it is 0.0, and from the deadband's edge it rises evenly to the end, so there is no jump.
pub fn signed(raw: i16, a: &Axis) -> f64 {
    let (c, db) = (a.centre as f64, a.deadband as f64);
    let d = raw as f64 - c;
    let towards_max = (d >= 0.0) == (a.max >= a.centre);
    let (end, sign) = if towards_max {
        (a.max as f64, 1.0)
    } else {
        (a.min as f64, -1.0)
    };
    let span = (end - c).abs() - db;
    sign * ((d.abs() - db) / span).clamp(0.0, 1.0)
}

/// An axis control's reading as a whole percent: -100 to 100, or 0 to 100 for throttle.
pub fn percent(role: AxisRole, raw: i16, a: &Axis) -> i32 {
    let s = signed(raw, a);
    let v = if role.one_sided() { (s + 1.0) / 2.0 } else { s };
    (v * 100.0).round() as i32
}

/// One axis control. `axis` and `percent` are `None` when the profile does not map it.
#[derive(Clone, Debug, PartialEq)]
pub struct AxisControl {
    pub role: AxisRole,
    pub axis: Option<usize>,
    pub percent: Option<i32>,
}

/// One on/off control. `button` and `on` are `None` when the profile does not map it.
#[derive(Clone, Debug, PartialEq)]
pub struct OnOffControl {
    pub role: OnOffRole,
    pub button: Option<usize>,
    pub on: Option<bool>,
}

/// One switch. `position` is the index into `positions`, `None` until one of its buttons has
/// been seen pressed.
#[derive(Clone, Debug, PartialEq)]
pub struct SwitchControl {
    pub name: String,
    pub buttons: Vec<usize>,
    pub positions: Vec<String>,
    pub position: Option<usize>,
}

impl SwitchControl {
    /// The position's name, or `unknown`.
    pub fn position_name(&self) -> &str {
        self.position
            .map(|i| self.positions[i].as_str())
            .unwrap_or("unknown")
    }
}

/// Every control at one moment: each of the vocabulary's, mapped or not, every switch, and
/// the inputs no control reads.
#[derive(Clone, Debug, PartialEq)]
pub struct Controls {
    pub profile: String,
    pub axes: Vec<AxisControl>,
    pub on_off: Vec<OnOffControl>,
    pub switches: Vec<SwitchControl>,
    pub unmapped_axes: Vec<usize>,
    pub unmapped_buttons: Vec<usize>,
}

/// Reads one radio through one profile. It remembers each switch's last position, since a
/// Pulse switch's button is pressed only for 0.2 s after the switch moves. Make a new one
/// whenever the radio is opened again: positions are not carried across a replug.
pub struct Mapper {
    profile: Profile,
    positions: Vec<Option<usize>>,
}

impl Mapper {
    pub fn new(profile: Profile) -> Mapper {
        let positions = vec![None; profile.switches.len()];
        Mapper { profile, positions }
    }

    pub fn profile(&self) -> &Profile {
        &self.profile
    }

    /// Takes the newest raw inputs and returns every control. Call it at least every 0.1 s,
    /// so no 0.2 s press is missed. A switch takes the position whose button alone is pressed;
    /// with none pressed, or more than one, it keeps the position it had.
    pub fn update(&mut self, inputs: &Inputs) -> Controls {
        let pressed = |b: usize| inputs.buttons.get(b).copied().unwrap_or(false);
        for (s, position) in self.profile.switches.iter().zip(self.positions.iter_mut()) {
            let mut down = s.buttons.iter().enumerate().filter(|(_, b)| pressed(**b));
            if let (Some((i, _)), None) = (down.next(), down.next()) {
                *position = Some(i);
            }
        }

        let axes = AxisRole::ALL
            .iter()
            .map(|&role| {
                let a = self.profile.axes.get(role);
                AxisControl {
                    role,
                    axis: a.map(|a| a.axis),
                    percent: a
                        .map(|a| percent(role, inputs.axes.get(a.axis).copied().unwrap_or(0), a)),
                }
            })
            .collect();

        let on_off = OnOffRole::ALL
            .iter()
            .map(|&role| {
                let button = match self.profile.on_off.get(role) {
                    Some(OnOffSource::Button { button }) => Some(*button),
                    // Refused by `Profile::parse`, so never reached.
                    _ => None,
                };
                OnOffControl {
                    role,
                    button,
                    on: button.map(pressed),
                }
            })
            .collect();

        let switches = self
            .profile
            .switches
            .iter()
            .zip(&self.positions)
            .map(|(s, &position)| SwitchControl {
                name: s.name.clone(),
                buttons: s.buttons.clone(),
                positions: s.positions.clone(),
                position,
            })
            .collect();

        let mapped_axes: BTreeSet<usize> = AxisRole::ALL
            .iter()
            .filter_map(|r| self.profile.axes.get(*r).map(|a| a.axis))
            .collect();
        let mut mapped_buttons: BTreeSet<usize> = self
            .profile
            .switches
            .iter()
            .flat_map(|s| s.buttons.iter().copied())
            .collect();
        for role in OnOffRole::ALL {
            if let Some(OnOffSource::Button { button }) = self.profile.on_off.get(role) {
                mapped_buttons.insert(*button);
            }
        }

        Controls {
            profile: self.profile.name.clone(),
            axes,
            on_off,
            switches,
            unmapped_axes: (0..inputs.axes.len())
                .filter(|i| !mapped_axes.contains(i))
                .collect(),
            unmapped_buttons: (0..inputs.buttons.len())
                .filter(|i| !mapped_buttons.contains(i))
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STICK: Axis = Axis {
        axis: 0,
        min: -32768,
        centre: 0,
        max: 32767,
        deadband: 500,
    };

    #[test]
    fn a_centred_stick_reads_zero_within_its_deadband() {
        for raw in [-500, -1, 0, 1, 500] {
            assert_eq!(percent(AxisRole::Roll, raw, &STICK), 0, "raw {raw}");
        }
        // Just past the deadband it starts from zero, without a jump.
        assert_eq!(signed(501, &STICK), 1.0 / 32267.0);
        assert_eq!(percent(AxisRole::Roll, 501, &STICK), 0);
    }

    #[test]
    fn a_stick_reads_minus_100_and_100_at_its_ends() {
        assert_eq!(percent(AxisRole::Roll, -32768, &STICK), -100);
        assert_eq!(percent(AxisRole::Roll, 32767, &STICK), 100);
        // Halfway from the deadband's edge to each end.
        assert_eq!(percent(AxisRole::Roll, 500 + 16134, &STICK), 50);
        assert_eq!(percent(AxisRole::Roll, -500 - 16134, &STICK), -50);
    }

    #[test]
    fn values_beyond_the_calibrated_ends_stay_at_the_ends() {
        let short = Axis {
            min: -30000,
            max: 30000,
            ..STICK
        };
        assert_eq!(percent(AxisRole::Pitch, -32768, &short), -100);
        assert_eq!(percent(AxisRole::Pitch, 32767, &short), 100);
    }

    #[test]
    fn throttle_reads_0_to_100() {
        let t = Axis {
            deadband: 0,
            ..STICK
        };
        assert_eq!(percent(AxisRole::Throttle, -32768, &t), 0);
        assert_eq!(percent(AxisRole::Throttle, 0, &t), 50);
        assert_eq!(percent(AxisRole::Throttle, 32767, &t), 100);
        // 37%: 13% of the way below the centre, on the lower half's 32768 steps.
        assert_eq!(percent(AxisRole::Throttle, -8520, &t), 37);
    }

    #[test]
    fn an_uneven_centre_calibrates_each_half_on_its_own() {
        let a = Axis {
            axis: 0,
            min: -30000,
            centre: 1000,
            max: 31000,
            deadband: 0,
        };
        assert_eq!(percent(AxisRole::Yaw, 1000, &a), 0);
        assert_eq!(percent(AxisRole::Yaw, 16000, &a), 50);
        assert_eq!(percent(AxisRole::Yaw, -14500, &a), -50);
    }

    #[test]
    fn a_reversed_axis_has_min_above_max() {
        let r = Axis {
            min: 32767,
            max: -32768,
            ..STICK
        };
        assert_eq!(percent(AxisRole::Roll, 32767, &r), -100);
        assert_eq!(percent(AxisRole::Roll, -32768, &r), 100);
        assert_eq!(percent(AxisRole::Roll, 200, &r), 0);
    }

    fn profile_text(body: &str) -> String {
        format!(
            "name = \"test\"\n[match]\nvendor = 0x1209\nproduct = 0x4F54\nname = \"TX16SMK3 Joystick\"\naxes = 8\nbuttons = 28\n{body}"
        )
    }

    fn profile(body: &str) -> Result<Profile, String> {
        Profile::parse(&profile_text(body))
    }

    const SA: &str = "[[switches]]\nname = \"SA\"\nbuttons = [0, 1, 2]\npositions = [\"up\", \"middle\", \"down\"]\n";

    #[test]
    fn the_control_switch_may_map_to_a_held_button() {
        let p = profile("[on-off]\ncontrol = { button = 20 }\n").unwrap();
        assert_eq!(p.on_off.control, Some(OnOffSource::Button { button: 20 }));
    }

    #[test]
    fn the_control_switch_mapped_to_a_switch_position_is_refused() {
        let e = profile(&format!(
            "{SA}[on-off]\ncontrol = {{ switch = \"SA\", position = \"down\" }}\n"
        ))
        .unwrap_err();
        assert_eq!(
            e,
            "control may only map to a held button (`control = { button = N }`), not a switch position: a Pulse switch's position is lost whenever a press is missed"
        );
    }

    #[test]
    fn the_control_switch_mapped_to_a_pulse_button_is_refused() {
        let e = profile(&format!("{SA}[on-off]\ncontrol = {{ button = 1 }}\n")).unwrap_err();
        assert_eq!(
            e,
            "control may only map to a held button, and button 1 is a Pulse button of switch SA"
        );
    }

    #[test]
    fn rtl_follows_the_same_rule() {
        let e = profile(&format!("{SA}[on-off]\nrtl = {{ button = 2 }}\n")).unwrap_err();
        assert_eq!(
            e,
            "rtl may only map to a held button, and button 2 is a Pulse button of switch SA"
        );
    }

    #[test]
    fn broken_profiles_are_refused_with_a_reason() {
        let cases = [
            (
                "[axes]\nroll = { axis = 0, min = -32768, center = 0, max = 32767 }\n",
                "unknown field `center`, expected one of `axis`, `min`, `centre`, `max`, `deadband`",
            ),
            (
                "[axes]\nelevator = { axis = 0, min = -1, centre = 0, max = 1 }\n",
                "unknown field `elevator`, expected one of `roll`, `pitch`, `throttle`, `yaw`, `aux1`, `aux2`, `aux3`, `aux4`",
            ),
            (
                "[axes]\nroll = { axis = 0, min = -100, centre = 0, max = 100 }\npitch = { axis = 0, min = -100, centre = 0, max = 100 }\n",
                "axis 0 drives more than one control",
            ),
            (
                "[axes]\nroll = { axis = 0, min = -100, centre = 200, max = 100 }\n",
                "roll: centre must lie between min and max",
            ),
            (
                "[axes]\nroll = { axis = 0, min = -100, centre = 0, max = 50, deadband = 50 }\n",
                "roll: deadband must be at least 0 and less than 50, the distance from centre to the nearer end",
            ),
            (
                "[axes]\nroll = { axis = 0, min = -40000, centre = 0, max = 100 }\n",
                "roll: min -40000 is outside -32768 to 32767",
            ),
            (
                "[axes]\nroll = { axis = 8, min = -100, centre = 0, max = 100 }\n",
                "roll: axis 8 is beyond the radio's axes",
            ),
            (
                "[[switches]]\nname = \"SA\"\nbuttons = [0, 1]\npositions = [\"up\", \"middle\", \"down\"]\n",
                "switch SA: needs one position name per button, and at least two",
            ),
            (
                "[[switches]]\nname = \"SA\"\nbuttons = [0, 1]\npositions = [\"up\", \"up\"]\n",
                "switch SA: position names must be non-empty and different",
            ),
            (
                "[[switches]]\nname = \"\"\nbuttons = [0, 1]\npositions = [\"up\", \"down\"]\n",
                "a switch has no name",
            ),
            (
                "[[switches]]\nname = \"SA\"\nbuttons = [0, 1]\npositions = [\"up\", \"\"]\n",
                "switch SA: position names must be non-empty and different",
            ),
            (&format!("{SA}{SA}"), "switch SA is named twice"),
            (
                &format!(
                    "{SA}[[switches]]\nname = \"SB\"\nbuttons = [2, 3]\npositions = [\"up\", \"down\"]\n"
                ),
                "button 2 is mapped more than once",
            ),
            (
                "[[switches]]\nname = \"SA\"\nbuttons = [27, 28]\npositions = [\"up\", \"down\"]\n",
                "switch SA: button 28 is beyond the radio's buttons",
            ),
        ];
        for (body, expected) in cases {
            assert_eq!(profile(body).unwrap_err(), expected, "for:\n{body}");
        }
        assert_eq!(
            Profile::parse(
                "name = \" \"\n[match]\nvendor = 0x1209\nproduct = 0x4F54\nname = \"R\"\n"
            )
            .unwrap_err(),
            "the profile has no name"
        );
        assert_eq!(
            Profile::parse(
                "name = \"p\"\n[match]\nvendor = 0x1209\nproduct = 0x4F54\nname = \" \"\n"
            )
            .unwrap_err(),
            "[match] needs the joystick's name, or part of it"
        );
        assert_eq!(
            Profile::parse(
                "name = \"p\"\n[match]\nvendor = 0x1209\nproduct = 0x4F54\nname = \"\"\n"
            )
            .unwrap_err(),
            "[match] needs the joystick's name, or part of it"
        );
    }

    fn info(name: &str) -> RadioInfo {
        RadioInfo {
            name: name.into(),
            vendor: 0x1209,
            product: 0x4F54,
            serial: None,
        }
    }

    #[test]
    fn a_profile_matches_by_usb_id_name_and_counts() {
        let p = profile(SA).unwrap();
        assert!(p.matches(&info("TX16SMK3 Joystick"), 8, 28));
        // SDL on macOS puts the USB manufacturer string first.
        assert!(p.matches(&info("OpenTX TX16SMK3 Joystick"), 8, 28));
        assert!(!p.matches(&info("Zorro Joystick"), 8, 28));
        assert!(!p.matches(&info("TX16S Joystick"), 8, 28));
        // The same radio on its Classic model reports 24 buttons.
        assert!(!p.matches(&info("TX16SMK3 Joystick"), 8, 24));
        assert!(!p.matches(
            &RadioInfo {
                vendor: 0x045E,
                ..info("TX16SMK3 Joystick")
            },
            8,
            28
        ));
    }

    #[test]
    fn without_counts_a_profile_still_needs_every_input_it_reads() {
        let p = Profile::parse(
            "name = \"loose\"\n[match]\nvendor = 0x1209\nproduct = 0x4F54\nname = \"R\"\n[axes]\nyaw = { axis = 3, min = -1, centre = 0, max = 1 }\n[on-off]\ncontrol = { button = 9 }\n",
        )
        .unwrap();
        assert!(p.matches(&info("R"), 4, 10));
        assert!(!p.matches(&info("R"), 3, 10));
        assert!(!p.matches(&info("R"), 4, 9));
    }

    #[test]
    fn a_mismatch_names_what_the_profile_expects_and_what_the_radio_is() {
        let p = profile(SA).unwrap();
        assert!(
            p.mismatches(&info("OpenTX TX16SMK3 Joystick"), 8, 28)
                .is_empty()
        );
        assert_eq!(
            p.mismatches(&info("OpenTX TX16SMK3 Joystick"), 8, 24),
            vec!["28 buttons, the radio has 24"]
        );
        assert_eq!(
            p.mismatches(
                &RadioInfo {
                    vendor: 0x045E,
                    product: 0x028E,
                    ..info("Zorro Joystick")
                },
                7,
                28
            ),
            vec![
                "USB id 1209:4f54, the radio is 045e:028e",
                "a name containing \"TX16SMK3 Joystick\", the radio is \"Zorro Joystick\"",
                "8 axes, the radio has 7",
            ]
        );
    }

    #[test]
    fn without_counts_a_mismatch_names_the_highest_input_read() {
        let p = Profile::parse(
            "name = \"loose\"\n[match]\nvendor = 0x1209\nproduct = 0x4F54\nname = \"R\"\n[axes]\nyaw = { axis = 3, min = -1, centre = 0, max = 1 }\n[on-off]\ncontrol = { button = 9 }\n",
        )
        .unwrap();
        assert_eq!(
            p.mismatches(&info("R"), 3, 9),
            vec![
                "at least 4 axes (it reads axis 3), the radio has 3",
                "at least 10 buttons (it reads button 9), the radio has 9",
            ]
        );
    }

    #[test]
    fn spaces_around_the_match_name_do_not_stop_it_matching() {
        let p = Profile::parse(&profile_text(SA).replace(
            "name = \"TX16SMK3 Joystick\"",
            "name = \" TX16SMK3 Joystick \"",
        ))
        .unwrap();
        assert!(p.matches(&info("OpenTX TX16SMK3 Joystick"), 8, 28));
    }

    #[test]
    fn when_none_match_each_profile_says_what_it_expects() {
        let a = profile(SA).unwrap();
        let b = Profile {
            name: "other".into(),
            matches: Match {
                name: "TX12 Joystick".into(),
                ..a.matches.clone()
            },
            ..a.clone()
        };
        assert_eq!(
            why_none_match(&[a, b], &info("OpenTX TX16SMK3 Joystick"), 8, 24),
            vec![
                "profile test expects 28 buttons, the radio has 24",
                "profile other expects a name containing \"TX12 Joystick\", the radio is \"OpenTX TX16SMK3 Joystick\"; 28 buttons, the radio has 24",
            ]
        );
    }

    #[test]
    fn find_takes_the_first_match() {
        let a = profile(SA).unwrap();
        let b = Profile {
            name: "other".into(),
            ..a.clone()
        };
        let both = [b, a];
        assert_eq!(
            find(&both, &info("TX16SMK3 Joystick"), 8, 28).map(|p| p.name.as_str()),
            Some("other")
        );
        assert!(find(&both, &info("TX16SMK3 Joystick"), 8, 24).is_none());
    }

    fn inputs(axes: Vec<i16>, pressed: &[usize]) -> Inputs {
        Inputs {
            axes,
            buttons: (0..28).map(|b| pressed.contains(&b)).collect(),
            hats: vec![],
        }
    }

    fn sa_mapper() -> Mapper {
        Mapper::new(
            profile(&format!(
                "[axes]\nthrottle = {{ axis = 2, min = -32768, centre = 0, max = 32767 }}\n{SA}[on-off]\ncontrol = {{ button = 20 }}\n"
            ))
            .unwrap(),
        )
    }

    #[test]
    fn a_switch_with_no_position_yet_is_unknown() {
        let c = sa_mapper().update(&inputs(vec![0; 8], &[]));
        assert_eq!(c.switches[0].position, None);
        assert_eq!(c.switches[0].position_name(), "unknown");
    }

    #[test]
    fn a_pulse_switch_keeps_its_last_position_after_the_press() {
        let mut m = sa_mapper();
        // The connect burst: the switch's current position pressed once.
        assert_eq!(
            m.update(&inputs(vec![0; 8], &[1])).switches[0].position_name(),
            "middle"
        );
        // 0.2 s later the press ends, and the position stays.
        assert_eq!(
            m.update(&inputs(vec![0; 8], &[])).switches[0].position_name(),
            "middle"
        );
        // Moved down.
        m.update(&inputs(vec![0; 8], &[2]));
        assert_eq!(
            m.update(&inputs(vec![0; 8], &[])).switches[0].position_name(),
            "down"
        );
        // Two of its buttons at once says nothing certain, so the last position stays.
        assert_eq!(
            m.update(&inputs(vec![0; 8], &[0, 1])).switches[0].position_name(),
            "down"
        );
    }

    #[test]
    fn every_control_is_listed_with_the_inputs_nothing_reads() {
        let c = sa_mapper().update(&inputs(vec![0, 0, -8520, 0, 0, 0, 0, 0], &[20, 21]));
        assert_eq!(c.profile, "test");
        assert_eq!(
            c.axes,
            AxisRole::ALL
                .iter()
                .map(|&role| AxisControl {
                    role,
                    axis: (role == AxisRole::Throttle).then_some(2),
                    percent: (role == AxisRole::Throttle).then_some(37),
                })
                .collect::<Vec<_>>()
        );
        assert_eq!(
            c.on_off,
            vec![
                OnOffControl {
                    role: OnOffRole::Control,
                    button: Some(20),
                    on: Some(true),
                },
                OnOffControl {
                    role: OnOffRole::Rtl,
                    button: None,
                    on: None,
                },
            ]
        );
        assert_eq!(c.unmapped_axes, vec![0, 1, 3, 4, 5, 6, 7]);
        assert_eq!(
            c.unmapped_buttons,
            (3..28).filter(|b| *b != 20).collect::<Vec<_>>()
        );
    }

    #[test]
    fn the_control_switch_reads_off_when_its_button_is_released() {
        let mut m = sa_mapper();
        assert_eq!(
            m.update(&inputs(vec![0; 8], &[20])).on_off[0].on,
            Some(true)
        );
        assert_eq!(m.update(&inputs(vec![0; 8], &[])).on_off[0].on, Some(false));
    }

    #[test]
    fn the_bundled_profiles_load() {
        let all = Profile::bundled();
        assert_eq!(
            all.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(),
            ["gcscode-adv"]
        );
    }
}
