//! Turns what SDL reports into text. Pure, so it is tested without a controller.

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

/// Axes as SDL gives them, -32768 to 32767, numbered from 0, four to a line.
pub fn axes_lines(axes: &[i16]) -> Vec<String> {
    axes.chunks(4)
        .enumerate()
        .map(|(row, chunk)| {
            chunk
                .iter()
                .enumerate()
                .map(|(i, v)| format!("axis {:>2} {:>6}", row * 4 + i, v))
                .collect::<Vec<_>>()
                .join("   ")
        })
        .collect()
}

/// Buttons in groups of eight, `1` pressed and `.` released, with the first index of each group.
pub fn buttons_line(buttons: &[bool]) -> String {
    buttons
        .chunks(8)
        .enumerate()
        .map(|(group, chunk)| {
            let marks: String = chunk.iter().map(|&b| if b { '1' } else { '.' }).collect();
            format!("{:>2}:{marks}", group * 8)
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Hats as SDL's bitmask (1 up, 2 right, 4 down, 8 left), numbered from 0.
pub fn hats_line(hats: &[u8]) -> String {
    hats.iter()
        .enumerate()
        .map(|(i, v)| format!("hat {i} {v:>2}"))
        .collect::<Vec<_>>()
        .join("   ")
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

    #[test]
    fn axes_are_numbered_from_zero_four_to_a_line() {
        let lines = axes_lines(&[-32768, 0, 32767, 5, -1, 100]);
        assert_eq!(
            lines,
            vec![
                "axis  0 -32768   axis  1      0   axis  2  32767   axis  3      5",
                "axis  4     -1   axis  5    100",
            ]
        );
        assert!(axes_lines(&[]).is_empty());
    }

    #[test]
    fn buttons_are_grouped_by_eight() {
        let mut b = vec![false; 10];
        b[0] = true;
        b[7] = true;
        b[9] = true;
        assert_eq!(buttons_line(&b), " 0:1......1  8:.1");
        assert_eq!(buttons_line(&[]), "");
    }

    #[test]
    fn hats_show_their_bitmask() {
        assert_eq!(hats_line(&[0, 9]), "hat 0  0   hat 1  9");
        assert_eq!(hats_line(&[]), "");
    }
}
