//! The station's radio side with a profile, driven by SDL's virtual joysticks standing in for
//! the TX16S on its gcscode-adv model. Its own test binary, since SDL is process-global.

use std::ffi::CString;

use mavlink_station::input::{mapper_for, snapshot};
use mavlink_station::snapshot::input_json;
use radio_probe::mapping::Profile;
use radio_probe::probe::Probe;
use sdl3::sys::joystick as sys;
use serde_json::{Value, json};

#[test]
fn the_station_serves_the_radio_through_its_profile() {
    let sdl = sdl3::init().unwrap();
    let joysticks = sdl.joystick().unwrap();
    let profiles = Profile::bundled();

    let name = CString::new("TX16SMK3 Joystick").unwrap();
    let mut desc = sys::SDL_VirtualJoystickDesc::new();
    desc.name = name.as_ptr();
    desc.vendor_id = 0x1209;
    desc.product_id = 0x4F54;
    desc.naxes = 8;
    desc.nbuttons = 28;
    // SAFETY: `desc` is fully initialised and `name` outlives the call.
    let id = unsafe { sys::SDL_AttachVirtualJoystick(&desc) };
    assert_ne!(id.0, 0);

    let mut probe = Probe::default();
    probe.added(&joysticks, id.into());
    let (mapper, line) = mapper_for(&probe, &profiles);
    assert_eq!(line, "mapped with profile gcscode-adv");
    let mut mapper = mapper.unwrap();
    let j = probe.radio().unwrap();
    let set = |b: i32, down: bool| {
        // SAFETY: `j` is the open virtual radio.
        assert!(unsafe { sys::SDL_SetJoystickVirtualButton(j.raw(), b, down) });
    };

    // The connect burst for SA middle, seen on one tick, then gone on the next.
    set(1, true);
    joysticks.update();
    snapshot(&probe, Some(&mut mapper), None);
    set(1, false);
    set(20, true);
    // SAFETY: `j` is the open virtual radio.
    unsafe { assert!(sys::SDL_SetJoystickVirtualAxis(j.raw(), 2, -8520)) };
    joysticks.update();
    let s = snapshot(&probe, Some(&mut mapper), Some(3));

    let v: Value = serde_json::from_str(&input_json(&s)).unwrap();
    let c = &v["controls"];
    assert_eq!(c["profile"], "gcscode-adv");
    assert_eq!(
        c["axes"][2],
        json!({"role": "throttle", "axis": 2, "percent": 37})
    );
    assert_eq!(
        c["onOff"][0],
        json!({"role": "control", "button": 20, "on": true})
    );
    assert_eq!(c["switches"][0]["name"], "SA");
    assert_eq!(c["switches"][0]["position"], "middle");
    assert_eq!(c["switches"][1]["position"], Value::Null);
    assert_eq!(c["unmappedButtons"], json!([21, 22, 23, 24, 25, 26, 27]));

    // Without a mapper the radio is still served, raw.
    let raw = snapshot(&probe, None, None);
    assert!(raw.radio.is_some());
    assert!(raw.controls.is_none());

    // A radio no profile is for: the same radio on its Classic model.
    // SAFETY: `id` is a virtual joystick this test attached.
    assert!(unsafe { sys::SDL_DetachVirtualJoystick(id) });
    probe.removed(id.into());
    desc.nbuttons = 24;
    // SAFETY: as above.
    let classic = unsafe { sys::SDL_AttachVirtualJoystick(&desc) };
    probe.added(&joysticks, classic.into());
    let (mapper, line) = mapper_for(&probe, &profiles);
    assert!(mapper.is_none());
    assert_eq!(
        line,
        "no profile matches this radio (8 axes, 24 buttons), so it serves raw values only"
    );
}
