//! A block of lines redrawn in place, so the values update live without scrolling, and
//! without flicker: each frame is one write that overwrites the old one instead of erasing it
//! first, and a frame that has not changed is not written at all.

/// Begin and end of a synchronised update: a terminal that knows them shows the frame only
/// once it is complete, and one that does not ignores them.
const SYNC_ON: &str = "\x1b[?2026h";
const SYNC_OFF: &str = "\x1b[?2026l";

/// Hide and show the cursor, which would otherwise jump through the block on every frame.
pub const HIDE_CURSOR: &str = "\x1b[?25l";
pub const SHOW_CURSOR: &str = "\x1b[?25h";

#[derive(Default)]
pub struct Panel {
    shown: Vec<String>,
}

impl Panel {
    /// The bytes that turn the block on screen into `lines`, or nothing if it already shows them.
    pub fn frame(&mut self, lines: &[String]) -> String {
        if self.shown == lines {
            return String::new();
        }
        let mut out = String::from(SYNC_ON);
        if !self.shown.is_empty() {
            out += &format!("\x1b[{}F", self.shown.len()); // up to the block's first line
        }
        for line in lines {
            // Write the line over the old one, then erase only what is left to its right.
            out += line;
            out += "\x1b[K\n";
        }
        if lines.len() < self.shown.len() {
            out += "\x1b[J"; // the block got shorter: erase the old lines below it
        }
        out += SYNC_OFF;
        self.shown = lines.to_vec();
        out
    }

    /// The bytes that erase the block, so a permanent message can be printed in its place.
    pub fn clear(&mut self) -> String {
        if self.shown.is_empty() {
            return String::new();
        }
        let out = format!("\x1b[{}F\x1b[J", self.shown.len());
        self.shown.clear();
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn first_frame_writes_each_line_without_erasing_first() {
        let mut p = Panel::default();
        assert_eq!(
            p.frame(&lines(&["a", "b"])),
            "\x1b[?2026ha\x1b[K\nb\x1b[K\n\x1b[?2026l"
        );
    }

    #[test]
    fn next_frame_moves_up_once_and_overwrites() {
        let mut p = Panel::default();
        p.frame(&lines(&["a", "b"]));
        assert_eq!(
            p.frame(&lines(&["c", "d"])),
            "\x1b[?2026h\x1b[2Fc\x1b[K\nd\x1b[K\n\x1b[?2026l"
        );
    }

    #[test]
    fn an_unchanged_frame_writes_nothing() {
        let mut p = Panel::default();
        p.frame(&lines(&["a", "b"]));
        assert_eq!(p.frame(&lines(&["a", "b"])), "");
    }

    #[test]
    fn a_shorter_frame_erases_the_old_lines_below() {
        let mut p = Panel::default();
        p.frame(&lines(&["a", "b", "c"]));
        assert_eq!(
            p.frame(&lines(&["d"])),
            "\x1b[?2026h\x1b[3Fd\x1b[K\n\x1b[J\x1b[?2026l"
        );
    }

    #[test]
    fn clear_erases_the_block_once() {
        let mut p = Panel::default();
        assert_eq!(p.clear(), "");
        p.frame(&lines(&["a", "b"]));
        assert_eq!(p.clear(), "\x1b[2F\x1b[J");
        assert_eq!(p.clear(), "");
        // After a clear the next frame starts fresh, without moving up.
        assert_eq!(p.frame(&lines(&["a"])), "\x1b[?2026ha\x1b[K\n\x1b[?2026l");
    }
}
