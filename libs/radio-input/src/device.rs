//! Which joysticks are EdgeTX radios, and how one is named when it is found.

/// USB vendor and product ID of every EdgeTX radio in joystick mode (the TX16S among them).
pub const EDGETX_VID: u16 = 0x1209;
pub const EDGETX_PID: u16 = 0x4F54;

pub fn is_edgetx(vendor: u16, product: u16) -> bool {
    vendor == EDGETX_VID && product == EDGETX_PID
}

/// One line describing a device, as printed when it is found.
pub fn device_line(index: u32, name: &str, vendor: u16, product: u16) -> String {
    let tag = if is_edgetx(vendor, product) {
        "  (EdgeTX radio)"
    } else {
        ""
    };
    format!("[{index}] {name}  {vendor:04x}:{product:04x}{tag}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_only_the_edgetx_joystick_ids() {
        assert!(is_edgetx(0x1209, 0x4F54));
        assert!(!is_edgetx(0x1209, 0x4F55));
        assert!(!is_edgetx(0x0483, 0x5740)); // EdgeTX in serial (VCP) mode
        assert!(!is_edgetx(0x045E, 0x028E)); // an Xbox 360 pad
    }

    #[test]
    fn device_line_tags_an_edgetx_radio() {
        assert_eq!(
            device_line(0, "TX16SMK3 Joystick", 0x1209, 0x4F54),
            "[0] TX16SMK3 Joystick  1209:4f54  (EdgeTX radio)"
        );
        assert_eq!(
            device_line(3, "Xbox Controller", 0x045E, 0x028E),
            "[3] Xbox Controller  045e:028e"
        );
    }
}
