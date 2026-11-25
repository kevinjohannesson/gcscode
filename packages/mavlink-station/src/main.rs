//! gcscode-station: reads an EdgeTX radio and serves its raw input to the gcscode page on
//! ws://127.0.0.1:8091/ws. Sends nothing to any vehicle.

use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use mavlink_station::{api, input, snapshot::Snapshot};
use radio_input::mapping::Profile;
use tokio::sync::watch;

const PORT: u16 = 8091;

fn main() {
    let mut allowed: Vec<String> = api::DEFAULT_ORIGINS.iter().map(|s| s.to_string()).collect();
    // Profiles given with --profile are tried before the bundled ones.
    let mut profiles = Vec::new();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match (arg.as_str(), args.next()) {
            ("--allow-origin", Some(origin)) => allowed.push(origin),
            ("--profile", Some(file)) => match load_profile(&file) {
                Ok(p) => profiles.push(p),
                Err(e) => {
                    eprintln!("station: {e}");
                    std::process::exit(2);
                }
            },
            _ => {
                eprintln!(
                    "usage: gcscode-station [--allow-origin <origin>]... [--profile <file>]..."
                );
                std::process::exit(2);
            }
        }
    }
    profiles.extend(Profile::bundled());
    let names: Vec<&str> = profiles.iter().map(|p| p.name.as_str()).collect();
    println!("station: radio profiles {}", names.join(", "));

    let (tx, rx) = watch::channel(Snapshot::default());
    let stop = Arc::new(AtomicBool::new(false));

    // The page's side runs on its own threads. The radio side keeps the main thread.
    let server_stop = stop.clone();
    let server = std::thread::spawn(move || {
        let runtime = tokio::runtime::Runtime::new().expect("a tokio runtime");
        // True once it served: false when it could not listen at all.
        runtime.block_on(async move {
            let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, PORT));
            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("station: cannot listen on {addr}: {e}");
                    server_stop.store(true, Ordering::Relaxed);
                    return false;
                }
            };
            println!("station: serving radio input on ws://{addr}/ws");
            let shutdown = async {
                let mut term =
                    tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                        .expect("a SIGTERM handler");
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {}
                    _ = term.recv() => {}
                }
            };
            let served = axum::serve(listener, api::router(rx, allowed))
                .with_graceful_shutdown(shutdown)
                .await;
            if let Err(e) = served {
                eprintln!("station: server stopped: {e}");
            }
            server_stop.store(true, Ordering::Relaxed);
            true
        })
    });

    if let Err(e) = input::run(tx, stop, profiles, false, || {}) {
        // Without the radio side there is nothing to serve, so leave without waiting for pages.
        eprintln!("station: {e}");
        std::process::exit(1);
    }
    let served = server.join().unwrap_or(false);
    println!("station: stopped.");
    if !served {
        // Nothing was served, so a launcher or script must not read this as a normal stop.
        std::process::exit(1);
    }
}

/// A profile file, read and checked. A profile that breaks a rule stops the station before it
/// serves anything, rather than mapping the radio wrongly.
fn load_profile(file: &str) -> Result<Profile, String> {
    let text = std::fs::read_to_string(file).map_err(|e| format!("cannot read {file}: {e}"))?;
    Profile::parse(&text).map_err(|e| format!("profile {file} refused: {e}"))
}
