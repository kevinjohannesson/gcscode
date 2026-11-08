#!/usr/bin/env python3
"""Fly a circle around home, then RTL.

Designed to exercise lat/lng change in your GCS — the drone will trace a
configurable-radius circle at a fixed altitude, hitting N waypoints around the
ring before returning to launch.

  $ python client/fly_circle.py
  $ python client/fly_circle.py --radius 50 --points 16 --turns 2
  $ python client/fly_circle.py --altitude 30 --turns 3
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mav_helpers import (
    DEFAULT_ENDPOINT,
    arm,
    connect,
    current_position,
    goto_global,
    latlon_offset,
    set_mode,
    takeoff,
    wait_altitude,
    wait_landed,
    wait_position_global,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--endpoint", default=DEFAULT_ENDPOINT,
                   help=f"MAVLink endpoint (default: {DEFAULT_ENDPOINT})")
    p.add_argument("--altitude", type=float, default=20.0,
                   help="circle altitude in metres above home (default: 20)")
    p.add_argument("--radius", type=float, default=30.0,
                   help="circle radius in metres (default: 30)")
    p.add_argument("--points", type=int, default=12,
                   help="waypoints around the circle (default: 12)")
    p.add_argument("--turns", type=int, default=1,
                   help="how many times to loop the circle (default: 1)")
    p.add_argument("--tolerance", type=float, default=4.0,
                   help="metres of slop for reaching each waypoint (default: 4)")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    master = connect(args.endpoint)

    print("\n[1] mode -> GUIDED")
    set_mode(master, "GUIDED")

    print("\n[2] arming")
    arm(master)

    print(f"\n[3] takeoff to {args.altitude:.0f} m")
    takeoff(master, args.altitude)
    wait_altitude(master, args.altitude)

    print("\n[4] capturing home position")
    home_lat, home_lon, _ = current_position(master)
    print(f"    home: {home_lat:.6f}, {home_lon:.6f}")

    total = args.points * args.turns
    print(f"\n[5] flying {args.turns} turn(s), radius {args.radius:.0f} m, "
          f"{args.points} waypoints/turn  ({total} total)")
    for turn in range(args.turns):
        for i in range(args.points):
            theta = 2.0 * math.pi * i / args.points
            north_m = args.radius * math.cos(theta)
            east_m  = args.radius * math.sin(theta)
            tgt_lat, tgt_lon = latlon_offset(home_lat, home_lon, north_m, east_m)

            wp_idx = turn * args.points + i + 1
            print(f"  wp {wp_idx:>2d}/{total}  "
                  f"-> {tgt_lat:.6f},{tgt_lon:.6f}  "
                  f"(N{north_m:+5.1f} E{east_m:+5.1f})")

            goto_global(master, tgt_lat, tgt_lon, args.altitude)
            wait_position_global(master, tgt_lat, tgt_lon,
                                 tolerance_m=args.tolerance)

    print("\n[6] returning to launch")
    set_mode(master, "RTL")
    # RTL handles the descent + auto-disarm. wait_landed watches both altitude
    # and the armed bit, so it'll return as soon as either condition trips.
    wait_landed(master)

    print("\nmission complete.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (TimeoutError, RuntimeError, KeyboardInterrupt) as e:
        print(f"\nFAILED: {e}", file=sys.stderr)
        sys.exit(1)
