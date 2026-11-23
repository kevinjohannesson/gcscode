//! Drives the probe with SDL's virtual joysticks, which stand in for a radio on any machine.
//! SDL is process-global, so everything runs in one test, in order.

use std::ffi::CString;

use radio_probe::probe::{Probe, read};
use sdl3::joystick::JoystickId;
use sdl3::sys::joystick as sys;

fn attach(
    name: &CString,
    vendor: u16,
    product: u16,
    axes: u16,
    buttons: u16,
    hats: u16,
) -> JoystickId {
    let mut desc = sys::SDL_VirtualJoystickDesc::new();
    desc.name = name.as_ptr();
    desc.vendor_id = vendor;
    desc.product_id = product;
    desc.naxes = axes;
    desc.nbuttons = buttons;
    desc.nhats = hats;
    // SAFETY: `desc` is fully initialised and `name` outlives the call.
    let id = unsafe { sys::SDL_AttachVirtualJoystick(&desc) };
    assert_ne!(id.0, 0, "SDL refused the virtual joystick");
    id.into()
}

fn detach(id: JoystickId) {
    // SAFETY: `id` is a virtual joystick this test attached.
    assert!(unsafe { sys::SDL_DetachVirtualJoystick(id.into()) });
}

#[test]
fn reads_an_edgetx_radio_and_survives_unplug_and_replug() {
    let sdl = sdl3::init().unwrap();
    let joysticks = sdl.joystick().unwrap();
    let mut probe = Probe::default();

    // A gamepad that is not an EdgeTX radio is reported and left alone.
    let pad_name = CString::new("Some Gamepad").unwrap();
    let pad = attach(&pad_name, 0x045E, 0x028E, 6, 11, 1);
    assert_eq!(
        probe.added(&joysticks, pad),
        vec![format!(
            "found [{}] Some Gamepad  045e:028e, not an EdgeTX radio, ignored",
            pad.raw()
        )]
    );
    assert!(probe.radio().is_none());

    // The radio as EdgeTX's Classic joystick presents it: 8 axes, 24 buttons, no hats.
    let radio_name = CString::new("TX16SMK3 Joystick").unwrap();
    let radio = attach(&radio_name, 0x1209, 0x4F54, 8, 24, 0);
    let lines = probe.added(&joysticks, radio);
    assert_eq!(
        lines[0],
        format!(
            "opened [{}] TX16SMK3 Joystick  1209:4f54  (EdgeTX radio)",
            radio.raw()
        )
    );
    assert_eq!(lines[1], "  serial (none)  axes 8  buttons 24  hats 0");

    // Values set on the virtual device come back raw, by index.
    let j = probe.radio().unwrap();
    // SAFETY: `j` is the open virtual radio.
    unsafe {
        assert!(sys::SDL_SetJoystickVirtualAxis(j.raw(), 0, -32768));
        assert!(sys::SDL_SetJoystickVirtualAxis(j.raw(), 2, 32767));
        assert!(sys::SDL_SetJoystickVirtualAxis(j.raw(), 7, 1234));
        assert!(sys::SDL_SetJoystickVirtualButton(j.raw(), 0, true));
        assert!(sys::SDL_SetJoystickVirtualButton(j.raw(), 15, true));
    }
    joysticks.update();
    assert_eq!(
        read(j),
        vec![
            "axis  0 -32768   axis  1      0   axis  2  32767   axis  3      0",
            "axis  4      0   axis  5      0   axis  6      0   axis  7   1234",
            "button   0  1  2  3  4  5  6  7  8  9 10 11",
            "         X  .  .  .  .  .  .  .  .  .  .  .",
            "button  12 13 14 15 16 17 18 19 20 21 22 23",
            "         .  .  .  X  .  .  .  .  .  .  .  .",
            "pressed: 0, 15",
        ]
    );

    // A second radio is reported, not opened.
    let second_name = CString::new("TX16SMK3 Joystick").unwrap();
    let second = attach(&second_name, 0x1209, 0x4F54, 8, 24, 0);
    assert_eq!(
        probe.added(&joysticks, second),
        vec![format!(
            "found [{}] TX16SMK3 Joystick  1209:4f54  (EdgeTX radio), a second EdgeTX radio, ignored",
            second.raw()
        )]
    );
    detach(second);
    assert_eq!(probe.removed(second), None);

    // Unplugging the gamepad says nothing; unplugging the radio is reported.
    detach(pad);
    assert_eq!(probe.removed(pad), None);
    detach(radio);
    assert_eq!(
        probe.removed(radio).as_deref(),
        Some("radio unplugged. Waiting for it to come back.")
    );
    assert!(probe.radio().is_none());

    // Plugged back in, it is opened again. This time it reports a hat (EdgeTX's Classic mode
    // has none, but a radio set up otherwise could), and the hat shows as its own line.
    let again = attach(&radio_name, 0x1209, 0x4F54, 2, 2, 1);
    assert!(probe.added(&joysticks, again)[0].starts_with("opened "));
    let j = probe.radio().unwrap();
    // SAFETY: `j` is the open virtual radio.
    unsafe {
        assert!(sys::SDL_SetJoystickVirtualHat(j.raw(), 0, 0x01 | 0x02));
    }
    joysticks.update();
    assert_eq!(
        read(j),
        vec![
            "axis  0      0   axis  1      0",
            "button   0  1",
            "         .  .",
            "pressed: none",
            "hat 0  3",
        ]
    );
}
