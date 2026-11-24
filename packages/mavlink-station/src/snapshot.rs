//! What the station knows about the radio at one moment, and how the page receives it.

use radio_input::mapping::Controls;
use radio_input::probe::{Inputs, RadioInfo};
use serde::Serialize;

/// The version of the page protocol. A page that sees another number says the two do not match.
/// 1 added `controls`, the radio's input through its profile (GCS-40).
pub const PROTOCOL: u32 = 1;

/// The newest state of the radio side, replaced whole on every change.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Snapshot {
    pub radio: Option<Radio>,
    /// The radio's input through the profile that matches it; `None` while no radio is open
    /// or no profile is for it.
    pub controls: Option<Controls>,
    /// Input events the radio delivered in the last whole second, once one has passed.
    pub events_per_second: Option<u32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Radio {
    pub info: RadioInfo,
    pub inputs: Inputs,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Message<'a> {
    Hello {
        protocol: u32,
        station: &'a str,
    },
    #[serde(rename_all = "camelCase")]
    Input {
        radio: Option<RadioJson<'a>>,
        controls: Option<ControlsJson<'a>>,
        events_per_second: Option<u32>,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RadioJson<'a> {
    name: &'a str,
    vendor_id: u16,
    product_id: u16,
    serial: Option<&'a str>,
    axes: &'a [i16],
    buttons: &'a [bool],
    hats: &'a [u8],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ControlsJson<'a> {
    profile: &'a str,
    axes: Vec<AxisJson>,
    on_off: Vec<OnOffJson>,
    switches: Vec<SwitchJson<'a>>,
    unmapped_axes: &'a [usize],
    unmapped_buttons: &'a [usize],
}

#[derive(Serialize)]
struct AxisJson {
    role: &'static str,
    axis: Option<usize>,
    percent: Option<i32>,
}

#[derive(Serialize)]
struct OnOffJson {
    role: &'static str,
    button: Option<usize>,
    on: Option<bool>,
}

#[derive(Serialize)]
struct SwitchJson<'a> {
    name: &'a str,
    buttons: &'a [usize],
    positions: &'a [String],
    position: Option<&'a str>,
}

fn controls_json(c: &Controls) -> ControlsJson<'_> {
    ControlsJson {
        profile: &c.profile,
        axes: c
            .axes
            .iter()
            .map(|a| AxisJson {
                role: a.role.id(),
                axis: a.axis,
                percent: a.percent,
            })
            .collect(),
        on_off: c
            .on_off
            .iter()
            .map(|o| OnOffJson {
                role: o.role.id(),
                button: o.button,
                on: o.on,
            })
            .collect(),
        switches: c
            .switches
            .iter()
            .map(|s| SwitchJson {
                name: &s.name,
                buttons: &s.buttons,
                positions: &s.positions,
                position: s.position.map(|i| s.positions[i].as_str()),
            })
            .collect(),
        unmapped_axes: &c.unmapped_axes,
        unmapped_buttons: &c.unmapped_buttons,
    }
}

/// The first message on every connection.
pub fn hello_json() -> String {
    serde_json::to_string(&Message::Hello {
        protocol: PROTOCOL,
        station: env!("CARGO_PKG_VERSION"),
    })
    .expect("a hello always serialises")
}

/// The message that carries a snapshot.
pub fn input_json(s: &Snapshot) -> String {
    let radio = s.radio.as_ref().map(|r| RadioJson {
        name: &r.info.name,
        vendor_id: r.info.vendor,
        product_id: r.info.product,
        serial: r.info.serial.as_deref(),
        axes: &r.inputs.axes,
        buttons: &r.inputs.buttons,
        hats: &r.inputs.hats,
    });
    serde_json::to_string(&Message::Input {
        radio,
        controls: s.controls.as_ref().map(controls_json),
        events_per_second: s.events_per_second,
    })
    .expect("an input message always serialises")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello_names_the_protocol_and_the_station_version() {
        assert_eq!(
            hello_json(),
            r#"{"type":"hello","protocol":1,"station":"0.1.0"}"#
        );
    }

    #[test]
    fn input_without_a_radio() {
        assert_eq!(
            input_json(&Snapshot::default()),
            r#"{"type":"input","radio":null,"controls":null,"eventsPerSecond":null}"#
        );
    }

    #[test]
    fn input_with_a_radio_carries_every_raw_value() {
        let s = Snapshot {
            radio: Some(Radio {
                info: RadioInfo {
                    name: "TX16SMK3 Joystick".into(),
                    vendor: 0x1209,
                    product: 0x4F54,
                    serial: Some("0123456789AB".into()),
                },
                inputs: Inputs {
                    axes: vec![-32768, 0, 32767],
                    buttons: vec![false, true],
                    hats: vec![],
                },
            }),
            controls: None,
            events_per_second: Some(250),
        };
        assert_eq!(
            input_json(&s),
            concat!(
                r#"{"type":"input","radio":{"name":"TX16SMK3 Joystick","vendorId":4617,"#,
                r#""productId":20308,"serial":"0123456789AB","axes":[-32768,0,32767],"#,
                r#""buttons":[false,true],"hats":[]},"controls":null,"eventsPerSecond":250}"#
            )
        );
    }

    #[test]
    fn input_carries_every_control_through_the_profile() {
        use radio_input::mapping::{AxisControl, AxisRole, OnOffControl, OnOffRole, SwitchControl};
        let s = Snapshot {
            controls: Some(Controls {
                profile: "gcscode-adv".into(),
                axes: vec![
                    AxisControl {
                        role: AxisRole::Throttle,
                        axis: Some(2),
                        percent: Some(37),
                    },
                    AxisControl {
                        role: AxisRole::Aux4,
                        axis: None,
                        percent: None,
                    },
                ],
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
                unmapped_axes: vec![7],
                unmapped_buttons: vec![21, 22],
            }),
            ..Snapshot::default()
        };
        assert_eq!(
            input_json(&s),
            concat!(
                r#"{"type":"input","radio":null,"controls":{"profile":"gcscode-adv","#,
                r#""axes":[{"role":"throttle","axis":2,"percent":37},"#,
                r#"{"role":"aux4","axis":null,"percent":null}],"#,
                r#""onOff":[{"role":"control","button":20,"on":true},"#,
                r#"{"role":"rtl","button":null,"on":null}],"#,
                r#""switches":[{"name":"SA","buttons":[0,1,2],"positions":["up","middle","down"],"position":"middle"},"#,
                r#"{"name":"SF","buttons":[15,16],"positions":["up","down"],"position":null}],"#,
                r#""unmappedAxes":[7],"unmappedButtons":[21,22]},"eventsPerSecond":null}"#
            )
        );
    }
}
