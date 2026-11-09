#!/usr/bin/env python3
"""Fly the SITL drone, or check the link to it.

From the repo root (inside a package folder, use pnpm -w fly-sitl):

  $ pnpm fly-sitl                          # list what it can do
  $ pnpm fly-sitl --circle 3               # three circles around home, then RTL
  $ pnpm fly-sitl --circle 3 --radius 50   # the rest goes to fly_circle.py
  $ pnpm fly-sitl --circle --help          # fly_circle.py's own options
  $ pnpm fly-sitl --takeoff 25             # take off to 25 m, hover, land

Each action hands over to one of the scripts beside this one, with the
arguments that follow it. The drone moves only when you name --circle or
--takeoff.
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# action: (script, the option its value fills or None, metavar, help)
ACTIONS = {
    "circle": ("fly_circle.py", "--turns", "TURNS",
               "fly circles around home, TURNS times, then RTL"),
    "takeoff": ("arm_takeoff.py", "--altitude", "METRES",
                "arm, take off to METRES, hover, land"),
    "connect": ("connect.py", None, None,
                "wait for one heartbeat, then exit; the drone does not move"),
    "telemetry": ("telemetry.py", None, None,
                  "print live attitude and position until Ctrl-C; the drone does not move"),
}
NOT_GIVEN = None
WITHOUT_VALUE = ""


def build_parser() -> argparse.ArgumentParser:
    # Without add_help, a --help after an action reaches that action's script.
    # Without allow_abbrev, the drone moves only on --circle or --takeoff in
    # full (never on --ta), and a script option is never read as an action.
    p = argparse.ArgumentParser(
        prog="pnpm fly-sitl",
        description=__doc__,
        epilog="Without a value, --circle and --takeoff use the script's default.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        add_help=False,
        allow_abbrev=False,
    )
    group = p.add_argument_group("actions").add_mutually_exclusive_group()
    for name, (_script, option, metavar, help_text) in ACTIONS.items():
        if option:
            group.add_argument(f"--{name}", nargs="?", const=WITHOUT_VALUE,
                               default=NOT_GIVEN, metavar=metavar, help=help_text)
        else:
            group.add_argument(f"--{name}", action="store_const", const=WITHOUT_VALUE,
                               default=NOT_GIVEN, help=help_text)
    return p


def main(argv: list[str]) -> int:
    parser = build_parser()
    args, rest = parser.parse_known_args(argv)
    chosen = [name for name in ACTIONS if getattr(args, name) is not NOT_GIVEN]

    if not chosen:
        if all(arg in ("-h", "--help") for arg in rest):
            parser.print_help()
            return 0
        names = ", ".join(f"--{name}" for name in ACTIONS)
        parser.error(f"name what to do first: {names}")

    name = chosen[0]
    script, option, _metavar, _help = ACTIONS[name]
    value = getattr(args, name)
    script_args = [option, value] if option and value != WITHOUT_VALUE else []
    path = os.path.join(HERE, script)
    # The script replaces this process, so main() never returns from here.
    os.execv(sys.executable, [sys.executable, path, *script_args, *rest])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
