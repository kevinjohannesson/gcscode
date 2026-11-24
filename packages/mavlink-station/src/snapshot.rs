//! What the station knows about the radio at one moment, and how the page receives it.

use radio_probe::probe::{Inputs, RadioInfo};
use serde::Serialize;

/// The version of the page protocol. A page that sees another number says the two do not match.
pub const PROTOCOL: u32 = 0;

/// The newest state of the radio side, replaced whole on every change.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Snapshot {
    pub radio: Option<Radio>,
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
            r#"{"type":"hello","protocol":0,"station":"0.1.0"}"#
        );
    }

    #[test]
    fn input_without_a_radio() {
        assert_eq!(
            input_json(&Snapshot::default()),
            r#"{"type":"input","radio":null,"eventsPerSecond":null}"#
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
            events_per_second: Some(250),
        };
        assert_eq!(
            input_json(&s),
            concat!(
                r#"{"type":"input","radio":{"name":"TX16SMK3 Joystick","vendorId":4617,"#,
                r#""productId":20308,"serial":"0123456789AB","axes":[-32768,0,32767],"#,
                r#""buttons":[false,true],"hats":[]},"eventsPerSecond":250}"#
            )
        );
    }
}
