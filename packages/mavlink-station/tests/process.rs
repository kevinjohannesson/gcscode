//! The built `gcscode-station` as the dev stack runs it: it serves on 8091, stops cleanly on
//! SIGTERM, and exits non-zero when it cannot listen, so a launcher can tell the two apart.

use std::net::TcpListener;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const STATION: &str = env!("CARGO_BIN_EXE_gcscode-station");
const ADDR: &str = "127.0.0.1:8091";

/// Waits for the child to exit, at most `limit`.
fn exit_within(child: &mut std::process::Child, limit: Duration) -> std::process::ExitStatus {
    let deadline = Instant::now() + limit;
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            return status;
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            panic!("the station did not exit within {limit:?}");
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

// One test, so the two cases never race for the port.
#[test]
fn it_stops_with_0_on_sigterm_and_1_when_it_cannot_listen() {
    // Hold the port first: a station already running on this machine would make both cases
    // meaningless, so the test steps aside instead of failing.
    let held = match TcpListener::bind(ADDR) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("skipped: {ADDR} is in use ({e}); stop the station running there first");
            return;
        }
    };

    // The port taken: it says why and exits 1.
    let out = Command::new(STATION).output().unwrap();
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert_eq!(out.status.code(), Some(1), "stderr: {stderr}");
    assert!(
        stderr.contains("station: cannot listen on 127.0.0.1:8091"),
        "stderr: {stderr}"
    );

    // The port free: it serves, and SIGTERM stops it with 0.
    drop(held);
    let mut child = Command::new(STATION)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    while std::net::TcpStream::connect(ADDR).is_err() {
        assert!(Instant::now() < deadline, "the station never listened on {ADDR}");
        std::thread::sleep(Duration::from_millis(50));
    }
    let killed = Command::new("kill")
        .args(["-TERM", &child.id().to_string()])
        .status()
        .unwrap();
    assert!(killed.success());
    assert_eq!(exit_within(&mut child, Duration::from_secs(5)).code(), Some(0));
}
