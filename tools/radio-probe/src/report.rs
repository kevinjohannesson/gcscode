//! Turns what SDL reports into text. Pure, so it is tested without a controller.

/// Width of an axis bar in characters. Odd, so 0 has a middle character of its own.
const BAR: usize = 33;

/// Where a raw axis value falls on the bar, 0 for -32768 up to `BAR - 1` for 32767.
fn bar_position(v: i16) -> usize {
    ((v as i32 + 32768) as f64 * (BAR - 1) as f64 / 65535.0).round() as usize
}

/// A bar filled from its middle (0) out to the value, `·` elsewhere. The middle is always
/// filled, so a centred stick shows as one mark.
pub fn axis_bar(v: i16) -> String {
    let mid = BAR / 2;
    let pos = bar_position(v);
    let (lo, hi) = (pos.min(mid), pos.max(mid));
    (0..BAR)
        .map(|i| if (lo..=hi).contains(&i) { '█' } else { '·' })
        .collect()
}

/// The axes as a table: number, raw value from -32768 to 32767, and a bar.
pub fn axes_table(axes: &[i16]) -> Vec<String> {
    let rule = |l: &str, m: &str, r: &str| {
        format!(
            "{l}{}{m}{}{m}{}{r}",
            "─".repeat(6),
            "─".repeat(8),
            "─".repeat(BAR + 2)
        )
    };
    let mut scale = vec![' '; BAR];
    for (at, text) in [(0, "-32768"), (BAR / 2, "0"), (BAR - 5, "32767")] {
        for (k, c) in text.chars().enumerate() {
            scale[at + k] = c;
        }
    }
    let scale: String = scale.into_iter().collect();

    let mut lines = vec![
        rule("┌", "┬", "┐"),
        format!("│ axis │  value │ {scale} │"),
        rule("├", "┼", "┤"),
    ];
    for (i, &v) in axes.iter().enumerate() {
        lines.push(format!("│ {i:>4} │ {v:>6} │ {} │", axis_bar(v)));
    }
    lines.push(rule("└", "┴", "┘"));
    lines
}

/// Buttons per row of the grid.
const ROW: usize = 12;

/// Reverse video on and off: how a pressed button is highlighted.
pub const ON: &str = "\x1b[7m";
pub const OFF: &str = "\x1b[0m";

/// The buttons as a grid of numbered cells, twelve to a row, a pressed one highlighted.
/// Then a line listing the pressed ones, which also reads where highlighting does not show.
pub fn buttons_grid(buttons: &[bool]) -> Vec<String> {
    let rule = |l: &str, m: &str, r: &str| format!("{l}{}{r}", ["────"; ROW].join(m));
    let mut lines = vec![
        "buttons, highlighted when pressed:".to_string(),
        rule("┌", "┬", "┐"),
    ];
    for (row, chunk) in buttons.chunks(ROW).enumerate() {
        if row > 0 {
            lines.push(rule("├", "┼", "┤"));
        }
        let cells: Vec<String> = (0..ROW)
            .map(|i| match chunk.get(i) {
                Some(true) => format!("{ON}{:>3} {OFF}", row * ROW + i),
                Some(false) => format!("{:>3} ", row * ROW + i),
                None => "    ".to_string(),
            })
            .collect();
        lines.push(format!("│{}│", cells.join("│")));
    }
    lines.push(rule("└", "┴", "┘"));
    let pressed: Vec<String> = buttons
        .iter()
        .enumerate()
        .filter(|(_, b)| **b)
        .map(|(i, _)| i.to_string())
        .collect();
    lines.push(if pressed.is_empty() {
        "pressed: none".to_string()
    } else {
        format!("pressed: {}", pressed.join(", "))
    });
    lines
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
    fn axis_bar_fills_from_the_middle_to_the_value() {
        assert_eq!(axis_bar(0), "················█················");
        assert_eq!(axis_bar(-32768), "█████████████████················");
        assert_eq!(axis_bar(32767), "················█████████████████");
        assert_eq!(axis_bar(16384), "················█████████········");
        assert_eq!(axis_bar(-32), "················█················"); // jitter stays in the middle
    }

    #[test]
    fn axes_are_a_table_numbered_from_zero() {
        assert_eq!(
            axes_table(&[-32768, 0, 1234]),
            vec![
                "┌──────┬────────┬───────────────────────────────────┐",
                "│ axis │  value │ -32768          0           32767 │",
                "├──────┼────────┼───────────────────────────────────┤",
                "│    0 │ -32768 │ █████████████████················ │",
                "│    1 │      0 │ ················█················ │",
                "│    2 │   1234 │ ················██··············· │",
                "└──────┴────────┴───────────────────────────────────┘",
            ]
        );
    }

    #[test]
    fn buttons_are_a_grid_with_pressed_ones_highlighted() {
        let mut b = vec![false; 14];
        b[0] = true;
        b[13] = true;
        let h = |n: &str| format!("{ON}{n} {OFF}");
        assert_eq!(
            buttons_grid(&b),
            vec![
                "buttons, highlighted when pressed:".to_string(),
                "┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐".to_string(),
                format!(
                    "│{}│  1 │  2 │  3 │  4 │  5 │  6 │  7 │  8 │  9 │ 10 │ 11 │",
                    h("  0")
                ),
                "├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤".to_string(),
                format!(
                    "│ 12 │{}│    │    │    │    │    │    │    │    │    │    │",
                    h(" 13")
                ),
                "└────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘".to_string(),
                "pressed: 0, 13".to_string(),
            ]
        );
        assert_eq!(buttons_grid(&[false]).last().unwrap(), "pressed: none");
    }

    #[test]
    fn hats_show_their_bitmask() {
        assert_eq!(hats_line(&[0, 9]), "hat 0  0   hat 1  9");
        assert_eq!(hats_line(&[]), "");
    }
}
