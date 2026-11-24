//! The probe's text with a profile: what each input means to gcscode, next to its raw value.
//! Pure, so it is tested without a controller.

use crate::mapping::{AxisRole, Controls};
use crate::report::axis_bar;

/// Width of the control column: `throttle -100%`.
const CONTROL: usize = 14;

/// What an axis drives, as `roll  -12%`, or `unmapped`.
pub fn axis_control(axis: usize, controls: &Controls) -> String {
    match controls.axes.iter().find(|c| c.axis == Some(axis)) {
        Some(c) => format!(
            "{:<8} {:>4}%",
            c.role.label(),
            c.percent.expect("a mapped axis has a percent")
        ),
        None => "unmapped".to_string(),
    }
}

/// The axes table with a control column between the raw value and the bar.
pub fn axes_table(axes: &[i16], controls: &Controls) -> Vec<String> {
    const BAR: usize = 33;
    let rule = |l: &str, m: &str, r: &str| {
        format!(
            "{l}{}{m}{}{m}{}{m}{}{r}",
            "─".repeat(6),
            "─".repeat(8),
            "─".repeat(CONTROL + 2),
            "─".repeat(BAR + 2)
        )
    };
    let mut lines = vec![
        rule("┌", "┬", "┐"),
        format!(
            "│ axis │  value │ {:<CONTROL$} │ -32768          0           32767 │",
            "control"
        ),
        rule("├", "┼", "┤"),
    ];
    for (i, &v) in axes.iter().enumerate() {
        lines.push(format!(
            "│ {i:>4} │ {v:>6} │ {:<CONTROL$} │ {} │",
            axis_control(i, controls),
            axis_bar(v)
        ));
    }
    lines.push(rule("└", "┴", "┘"));
    lines
}

/// A list of numbers, or `none`.
fn numbers(v: &[usize]) -> String {
    if v.is_empty() {
        "none".to_string()
    } else {
        v.iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join(", ")
    }
}

/// The lines under the buttons grid: the profile, each switch's position, each on/off control,
/// what the profile leaves out, and the inputs nothing reads.
pub fn controls_lines(controls: &Controls) -> Vec<String> {
    let mut lines = vec![format!("profile {}", controls.profile)];
    if !controls.switches.is_empty() {
        let switches: Vec<String> = controls
            .switches
            .iter()
            .map(|s| format!("{} {:<7}", s.name, s.position_name()))
            .collect();
        lines.push(switches.join("  ").trim_end().to_string());
    }
    let on_off: Vec<String> = controls
        .on_off
        .iter()
        .filter_map(|c| {
            c.on.map(|on| {
                format!(
                    "{} {} (button {})",
                    c.role.label(),
                    if on { "on" } else { "off" },
                    c.button.expect("a mapped control has a button")
                )
            })
        })
        .collect();
    if !on_off.is_empty() {
        lines.push(on_off.join("   "));
    }
    let not_mapped: Vec<&str> = AxisRole::ALL
        .iter()
        .filter(|r| {
            controls
                .axes
                .iter()
                .any(|c| c.role == **r && c.axis.is_none())
        })
        .map(|r| r.label())
        .chain(
            controls
                .on_off
                .iter()
                .filter(|c| c.button.is_none())
                .map(|c| c.role.label()),
        )
        .collect();
    if !not_mapped.is_empty() {
        lines.push(format!("not mapped: {}", not_mapped.join(", ")));
    }
    lines.push(format!(
        "unmapped axes: {}   unmapped buttons: {}",
        numbers(&controls.unmapped_axes),
        numbers(&controls.unmapped_buttons)
    ));
    lines
}

/// What the probe prints when a radio opens and no profile is for it.
pub const NO_PROFILE: &str = "no profile matches this radio, so only raw values are shown";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mapping::{AxisControl, OnOffControl, OnOffRole, SwitchControl};

    fn controls() -> Controls {
        let mapped = [(AxisRole::Roll, 0, -12), (AxisRole::Throttle, 2, 37)];
        Controls {
            profile: "gcscode-adv".into(),
            axes: AxisRole::ALL
                .iter()
                .map(|&role| {
                    let m = mapped.iter().find(|(r, _, _)| *r == role);
                    AxisControl {
                        role,
                        axis: m.map(|m| m.1),
                        percent: m.map(|m| m.2),
                    }
                })
                .collect(),
            on_off: vec![
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
            ],
            switches: vec![
                SwitchControl {
                    name: "SA".into(),
                    buttons: vec![0, 1, 2],
                    positions: vec!["up".into(), "middle".into(), "down".into()],
                    position: Some(1),
                },
                SwitchControl {
                    name: "SF".into(),
                    buttons: vec![15, 16],
                    positions: vec!["up".into(), "down".into()],
                    position: None,
                },
            ],
            unmapped_axes: vec![1],
            unmapped_buttons: vec![21, 22],
        }
    }

    #[test]
    fn each_axis_shows_its_control_next_to_its_raw_value() {
        assert_eq!(
            axes_table(&[-3932, 0, -8520], &controls()),
            vec![
                "┌──────┬────────┬────────────────┬───────────────────────────────────┐",
                "│ axis │  value │ control        │ -32768          0           32767 │",
                "├──────┼────────┼────────────────┼───────────────────────────────────┤",
                "│    0 │  -3932 │ roll      -12% │ ··············███················ │",
                "│    1 │      0 │ unmapped       │ ················█················ │",
                "│    2 │  -8520 │ throttle   37% │ ············█████················ │",
                "└──────┴────────┴────────────────┴───────────────────────────────────┘",
            ]
        );
    }

    #[test]
    fn switches_on_off_controls_and_unmapped_inputs_in_plain_words() {
        assert_eq!(
            controls_lines(&controls()),
            vec![
                "profile gcscode-adv",
                "SA middle   SF unknown",
                "control on (button 20)",
                "not mapped: pitch, yaw, aux 1, aux 2, aux 3, aux 4, RTL",
                "unmapped axes: 1   unmapped buttons: 21, 22",
            ]
        );
    }

    #[test]
    fn a_control_that_is_off_says_so() {
        let mut c = controls();
        c.on_off[0].on = Some(false);
        assert_eq!(controls_lines(&c)[2], "control off (button 20)");
    }

    #[test]
    fn nothing_unmapped_reads_none() {
        let c = Controls {
            unmapped_axes: vec![],
            unmapped_buttons: vec![],
            ..controls()
        };
        assert_eq!(
            controls_lines(&c).last().unwrap(),
            "unmapped axes: none   unmapped buttons: none"
        );
    }
}
