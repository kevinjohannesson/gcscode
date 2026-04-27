"""Shared MAVLink helpers for talking to ArduPilot SITL.

Designed to be importable as a small library — methods stay pure-ish so they
can be reused from a future ground-station app.
"""
from __future__ import annotations

import math
import time
from typing import Optional

from pymavlink import mavutil

DEFAULT_ENDPOINT = "udp:127.0.0.1:14550"

# A ground-station-class source_system id (255 by convention) avoids collisions
# with MAVProxy (1) and the autopilot (1, component 1).
GCS_SYSTEM_ID = 255


def connect(endpoint: str = DEFAULT_ENDPOINT, timeout: float = 10.0):
    """Open a MAVLink connection and block until first heartbeat.

    Returns a `pymavlink.mavutil.mavfile` instance with `target_system` and
    `target_component` populated. Raises TimeoutError on no heartbeat.
    """
    print(f"connecting to {endpoint} ...")
    master = mavutil.mavlink_connection(endpoint, source_system=GCS_SYSTEM_ID)
    hb = master.wait_heartbeat(timeout=timeout)
    if hb is None:
        raise TimeoutError(f"no heartbeat from {endpoint} within {timeout}s")

    autopilot = mavutil.mavlink.enums["MAV_AUTOPILOT"][hb.autopilot].name
    vtype = mavutil.mavlink.enums["MAV_TYPE"][hb.type].name
    print(f"  sysid={master.target_system} compid={master.target_component} "
          f"type={vtype} autopilot={autopilot}")
    return master


def set_mode(master, mode_name: str, timeout: float = 5.0) -> None:
    """Set autopilot mode by name (e.g. 'GUIDED', 'LAND', 'RTL', 'STABILIZE')."""
    mapping = master.mode_mapping() or {}
    if mode_name not in mapping:
        raise ValueError(f"unknown mode {mode_name!r}; available: {sorted(mapping)}")
    mode_id = mapping[mode_name]

    master.mav.set_mode_send(
        master.target_system,
        mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,
        mode_id,
    )

    deadline = time.time() + timeout
    while time.time() < deadline:
        msg = master.recv_match(type="HEARTBEAT", blocking=True, timeout=1)
        if msg and msg.custom_mode == mode_id:
            print(f"  mode -> {mode_name}")
            return
    raise TimeoutError(f"timed out switching to {mode_name}")


def arm(master, retries: int = 15, retry_delay: float = 2.0) -> None:
    """Arm motors. Retries while pre-arm checks are still settling.

    SITL pre-arm (EKF convergence + GPS lock) usually clears within ~10s of
    boot. We retry on TEMPORARILY_REJECTED to ride that out.
    """
    for attempt in range(1, retries + 1):
        master.mav.command_long_send(
            master.target_system, master.target_component,
            mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
            0,
            1,  # 1 = arm
            0, 0, 0, 0, 0, 0,
        )
        ack = master.recv_match(type="COMMAND_ACK", blocking=True, timeout=2)
        if ack is None:
            continue
        if ack.command != mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM:
            continue

        if ack.result == mavutil.mavlink.MAV_RESULT_ACCEPTED:
            master.motors_armed_wait()
            print("  armed")
            return
        if ack.result == mavutil.mavlink.MAV_RESULT_TEMPORARILY_REJECTED:
            print(f"  pre-arm not ready, retry {attempt}/{retries}")
            time.sleep(retry_delay)
            continue

        result_name = mavutil.mavlink.enums["MAV_RESULT"][ack.result].name
        raise RuntimeError(f"arm rejected: {result_name}")

    raise TimeoutError("failed to arm after retries")


def disarm(master) -> None:
    master.mav.command_long_send(
        master.target_system, master.target_component,
        mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
        0,
        0,  # 0 = disarm
        0, 0, 0, 0, 0, 0,
    )
    master.motors_disarmed_wait()
    print("  disarmed")


def takeoff(master, altitude_m: float) -> None:
    """Issue a GUIDED takeoff. Vehicle must already be armed and in GUIDED."""
    master.mav.command_long_send(
        master.target_system, master.target_component,
        mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
        0,
        0, 0, 0, 0, 0, 0,
        altitude_m,
    )
    print(f"  takeoff command sent: target {altitude_m:.1f} m")


def wait_altitude(master, target_m: float, tolerance_m: float = 0.5,
                  timeout_s: float = 60.0) -> float:
    """Block until vehicle reaches target altitude (relative to home)."""
    deadline = time.time() + timeout_s
    last_log = 0.0
    while time.time() < deadline:
        msg = master.recv_match(type="GLOBAL_POSITION_INT", blocking=True, timeout=1)
        if msg is None:
            continue
        rel_alt = msg.relative_alt / 1000.0  # mm -> m
        now = time.time()
        if now - last_log > 1.0:
            print(f"  climbing: {rel_alt:5.2f} m / {target_m:.1f} m", end="\r", flush=True)
            last_log = now
        if abs(rel_alt - target_m) <= tolerance_m:
            print(f"\n  altitude reached: {rel_alt:.2f} m")
            return rel_alt
    raise TimeoutError(f"did not reach {target_m} m within {timeout_s}s")


def wait_landed(master, timeout_s: float = 90.0) -> None:
    """Block until vehicle is on the ground (low altitude OR disarmed)."""
    deadline = time.time() + timeout_s
    last_log = 0.0
    while time.time() < deadline:
        msg = master.recv_match(
            type=["GLOBAL_POSITION_INT", "HEARTBEAT"], blocking=True, timeout=1,
        )
        if msg is None:
            continue
        if msg.get_type() == "HEARTBEAT":
            armed = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
            if not armed:
                print("\n  disarmed (auto)")
                return
        elif msg.get_type() == "GLOBAL_POSITION_INT":
            rel_alt = msg.relative_alt / 1000.0
            now = time.time()
            if now - last_log > 1.0:
                print(f"  descending: {rel_alt:5.2f} m", end="\r", flush=True)
                last_log = now
            if rel_alt < 0.2:
                print(f"\n  on ground: {rel_alt:.2f} m")
                return
    raise TimeoutError("did not detect landing within timeout")


def request_default_streams(master) -> None:
    """Ask SITL to push a useful default set of telemetry streams."""
    streams = {
        mavutil.mavlink.MAV_DATA_STREAM_EXTRA1: 10,             # ATTITUDE
        mavutil.mavlink.MAV_DATA_STREAM_EXTRA2: 4,              # VFR_HUD
        mavutil.mavlink.MAV_DATA_STREAM_POSITION: 5,            # GLOBAL_POSITION_INT
        mavutil.mavlink.MAV_DATA_STREAM_EXTENDED_STATUS: 2,     # SYS_STATUS, GPS_RAW_INT
        mavutil.mavlink.MAV_DATA_STREAM_RC_CHANNELS: 2,
    }
    for stream_id, hz in streams.items():
        master.mav.request_data_stream_send(
            master.target_system, master.target_component,
            stream_id, hz, 1,  # 1 = enable
        )


def rad_to_deg(x: Optional[float]) -> float:
    return math.degrees(x) if x is not None else 0.0
