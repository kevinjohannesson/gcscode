//! The gcscode-adv profile read through SDL's virtual joysticks, standing in for the TX16S on
//! its Advanced model. Its own test binary, since SDL is process-global.

use std::ffi::CString;

use radio_probe::mapping::{self, Mapper, Profile};
use radio_probe::probe::{Probe, values};
use sdl3::joystick::JoystickId;
use sdl3::sys::joystick as sys;

fn attach(name: &CString, buttons: u16) -> JoystickId {
    let mut desc = sys::SDL_VirtualJoystickDesc::new();
    desc.name = name.as_ptr();
    desc.vendor_id = 0x1209;
    desc.product_id = 0x4F54;
    desc.naxes = 8;
    desc.nbuttons = buttons;
    // SAFETY: `desc` is fully initialised and `name` outlives the call.
    let id = unsafe { sys::SDL_AttachVirtualJoystick(&desc) };
    assert_ne!(id.0, 0, "SDL refused the virtual joystick");
    id.into()
}

#[test]
fn the_advanced_model_reads_as_named_controls() {
    let sdl = sdl3::init().unwrap();
    let joysticks = sdl.joystick().unwrap();
    let profiles = Profile::bundled();
    let name = CString::new("TX16SMK3 Joystick").unwrap();

    // The radio on its Classic model: 24 buttons, so the Advanced profile is not for it.
    let classic = attach(&name, 24);
    let mut probe = Probe::default();
    probe.added(&joysticks, classic);
    let j = probe.radio().unwrap();
    assert!(
        mapping::find(
            &profiles,
            probe.info().unwrap(),
            8,
            j.num_buttons() as usize
        )
        .is_none()
    );
    // SAFETY: `classic` is a virtual joystick this test attached.
    assert!(unsafe { sys::SDL_DetachVirtualJoystick(classic.into()) });
    probe.removed(classic);

    // On gcscode-adv it reports 28 buttons and the profile matches.
    let radio = attach(&name, 28);
    probe.added(&joysticks, radio);
    let j = probe.radio().unwrap();
    let profile = mapping::find(
        &profiles,
        probe.info().unwrap(),
        j.num_axes() as usize,
        j.num_buttons() as usize,
    )
    .expect("gcscode-adv matches");
    assert_eq!(profile.name, "gcscode-adv");
    let mut mapper = Mapper::new(profile.clone());

    // Before anything is pressed, no switch has a position.
    joysticks.update();
    let c = mapper.update(&values(j));
    let positions = |c: &mapping::Controls| {
        c.switches
            .iter()
            .map(|s| format!("{} {}", s.name, s.position_name()))
            .collect::<Vec<_>>()
    };
    assert_eq!(
        positions(&c),
        [
            "SA unknown",
            "SB unknown",
            "SC unknown",
            "SD unknown",
            "SE unknown",
            "SF unknown",
            "SG unknown"
        ]
    );

    // The connect burst: each switch's current position pressed at once, then released.
    // SA middle (1), SB up (3), SC down (8), SD up (9), SE up (12), SF down (16), SG up (17).
    let burst = [1, 3, 8, 9, 12, 16, 17];
    let set = |b: i32, down: bool| {
        // SAFETY: `j` is the open virtual radio.
        assert!(unsafe { sys::SDL_SetJoystickVirtualButton(j.raw(), b, down) });
    };
    for b in burst {
        set(b, true);
    }
    joysticks.update();
    mapper.update(&values(j));
    for b in burst {
        set(b, false);
    }
    // Sticks: throttle at 37%, roll centred within its deadband, pitch full forward; the
    // control switch on.
    // SAFETY: `j` is the open virtual radio.
    unsafe {
        assert!(sys::SDL_SetJoystickVirtualAxis(j.raw(), 0, -300));
        assert!(sys::SDL_SetJoystickVirtualAxis(j.raw(), 1, 32767));
        assert!(sys::SDL_SetJoystickVirtualAxis(j.raw(), 2, -8520));
    }
    set(20, true);
    joysticks.update();
    let c = mapper.update(&values(j));
    assert_eq!(
        positions(&c),
        [
            "SA middle",
            "SB up",
            "SC down",
            "SD up",
            "SE up",
            "SF down",
            "SG up"
        ]
    );
    let percent = |id: &str| c.axes.iter().find(|a| a.role.id() == id).unwrap().percent;
    assert_eq!(percent("roll"), Some(0));
    assert_eq!(percent("pitch"), Some(100));
    assert_eq!(percent("throttle"), Some(37));
    assert_eq!(c.on_off[0].on, Some(true));
    assert_eq!(c.unmapped_axes, Vec::<usize>::new());
    assert_eq!(c.unmapped_buttons, (21..28).collect::<Vec<_>>());

    // SA flicked up: a 0.2 s press of button 0, then nothing, and SA stays up.
    set(0, true);
    joysticks.update();
    mapper.update(&values(j));
    set(0, false);
    set(20, false);
    joysticks.update();
    let c = mapper.update(&values(j));
    assert_eq!(c.switches[0].position_name(), "up");
    assert_eq!(c.on_off[0].on, Some(false));
}
