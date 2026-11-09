#!/usr/bin/env python3
"""Heartbeat sanity check.

Connects to SITL, prints the first heartbeat, then exits. Use this to confirm
your network plumbing is right before running anything more interesting.

  $ pnpm fly-sitl --connect
  $ pnpm fly-sitl --connect udp:127.0.0.1:14551    # custom endpoint
"""
import os
import sys

# Find mav_helpers whatever the working directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mav_helpers import DEFAULT_ENDPOINT, connect


def main() -> int:
    endpoint = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ENDPOINT
    try:
        connect(endpoint)
    except TimeoutError as e:
        print(f"FAILED: {e}", file=sys.stderr)
        print("  Is SITL running?  ./run_sitl.sh", file=sys.stderr)
        return 1
    print("OK — SITL is reachable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
