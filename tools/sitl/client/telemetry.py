#!/usr/bin/env python3
"""Live telemetry stream.

Connects, asks SITL to push attitude/position/status streams, and prints the
current state on a single self-refreshing line at ~4 Hz.

  $ pnpm fly-sitl --telemetry
  $ pnpm fly-sitl --telemetry udp:127.0.0.1:14551
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pymavlink import mavutil

from mav_helpers import (
    DEFAULT_ENDPOINT,
    connect,
    rad_to_deg,
    request_default_streams,
)


def main() -> int:
    endpoint = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ENDPOINT
    master = connect(endpoint)
    request_default_streams(master)

    state = {
        "mode": "?", "armed": False,
        "lat": 0.0, "lon": 0.0, "rel_alt": 0.0, "hdg": 0.0,
        "roll": 0.0, "pitch": 0.0, "yaw": 0.0,
        "vbat": 0.0, "ibat": 0.0, "remaining": -1,
        "groundspeed": 0.0, "throttle": 0,
    }

    last_print = 0.0
    print("streaming. Ctrl-C to stop.\n")

    try:
        while True:
            msg = master.recv_match(blocking=True, timeout=1)
            if msg is None:
                continue
            t = msg.get_type()

            if t == "HEARTBEAT":
                state["mode"] = mavutil.mode_string_v10(msg)
                state["armed"] = bool(
                    msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED
                )
            elif t == "ATTITUDE":
                state["roll"] = msg.roll
                state["pitch"] = msg.pitch
                state["yaw"] = msg.yaw
            elif t == "GLOBAL_POSITION_INT":
                state["lat"] = msg.lat / 1e7
                state["lon"] = msg.lon / 1e7
                state["rel_alt"] = msg.relative_alt / 1000.0
                state["hdg"] = msg.hdg / 100.0
            elif t == "VFR_HUD":
                state["groundspeed"] = msg.groundspeed
                state["throttle"] = msg.throttle
            elif t == "SYS_STATUS":
                state["vbat"] = msg.voltage_battery / 1000.0
                state["ibat"] = msg.current_battery / 100.0
                state["remaining"] = msg.battery_remaining

            now = time.time()
            if now - last_print >= 0.25:
                armed = "ARMED" if state["armed"] else "disarm"
                line = (
                    f"{state['mode']:>9s} {armed:>6s}  "
                    f"alt={state['rel_alt']:6.2f}m  "
                    f"{state['lat']:.5f},{state['lon']:.5f}  "
                    f"hdg={state['hdg']:5.1f}  "
                    f"R/P/Y={rad_to_deg(state['roll']):+5.1f}/"
                    f"{rad_to_deg(state['pitch']):+5.1f}/"
                    f"{rad_to_deg(state['yaw']):+6.1f}  "
                    f"gs={state['groundspeed']:4.1f} thr={state['throttle']:3d}%  "
                    f"V={state['vbat']:4.2f} bat={state['remaining']:3d}%"
                )
                # Pad/clip to 160 chars and overwrite in place.
                print(f"\r{line:<160s}", end="", flush=True)
                last_print = now

    except KeyboardInterrupt:
        print("\nstopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
