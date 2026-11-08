#!/usr/bin/env python3
"""End-to-end mission: connect, GUIDED, arm, takeoff, hover, land, disarm.

  $ python client/arm_takeoff.py                    # 10 m takeoff, 5 s hover
  $ python client/arm_takeoff.py --altitude 25      # 25 m takeoff
  $ python client/arm_takeoff.py --hover 15         # hover 15 s
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mav_helpers import (
    DEFAULT_ENDPOINT,
    arm,
    connect,
    disarm,
    set_mode,
    takeoff,
    wait_altitude,
    wait_landed,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--endpoint", default=DEFAULT_ENDPOINT,
                   help=f"MAVLink endpoint (default: {DEFAULT_ENDPOINT})")
    p.add_argument("--altitude", type=float, default=10.0,
                   help="takeoff altitude in metres (default: 10)")
    p.add_argument("--hover", type=float, default=5.0,
                   help="seconds to hover before landing (default: 5)")
    return p.parse_args()


def hover_for(master, seconds: float) -> None:
    import time
    print(f"  hovering for {seconds:.0f} s")
    end = time.time() + seconds
    while time.time() < end:
        msg = master.recv_match(type="GLOBAL_POSITION_INT", blocking=True, timeout=1)
        if msg:
            rel_alt = msg.relative_alt / 1000.0
            print(f"    alt={rel_alt:.2f} m   t-{end - time.time():4.1f}s",
                  end="\r", flush=True)
    print()


def main() -> int:
    args = parse_args()
    master = connect(args.endpoint)

    print("\n[1/6] mode -> GUIDED")
    set_mode(master, "GUIDED")

    print("\n[2/6] arming")
    arm(master)

    print(f"\n[3/6] takeoff to {args.altitude:.1f} m")
    takeoff(master, args.altitude)
    wait_altitude(master, args.altitude)

    print(f"\n[4/6] hover")
    hover_for(master, args.hover)

    print("\n[5/6] mode -> LAND")
    set_mode(master, "LAND")
    wait_landed(master)

    print("\n[6/6] disarming (safety net — usually auto-disarms on land)")
    try:
        disarm(master)
    except Exception:
        pass  # already disarmed

    print("\nmission complete.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (TimeoutError, RuntimeError, KeyboardInterrupt) as e:
        print(f"\nFAILED: {e}", file=sys.stderr)
        sys.exit(1)
