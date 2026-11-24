//! gcscode-station: reads an EdgeTX radio and serves its raw input to the gcscode page on
//! ws://127.0.0.1:8091/ws. Sends nothing to any vehicle.

use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use mavlink_station::{api, input, snapshot::Snapshot};
use tokio::sync::watch;

const PORT: u16 = 8091;

fn main() {
    let mut allowed: Vec<String> = api::DEFAULT_ORIGINS.iter().map(|s| s.to_string()).collect();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match (arg.as_str(), args.next()) {
            ("--allow-origin", Some(origin)) => allowed.push(origin),
            _ => {
                eprintln!("usage: gcscode-station [--allow-origin <origin>]...");
                std::process::exit(2);
            }
        }
    }

    let (tx, rx) = watch::channel(Snapshot::default());
    let stop = Arc::new(AtomicBool::new(false));

    // The page's side runs on its own threads. The radio side keeps the main thread.
    let server_stop = stop.clone();
    let server = std::thread::spawn(move || {
        let runtime = tokio::runtime::Runtime::new().expect("a tokio runtime");
        runtime.block_on(async move {
            let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, PORT));
            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("station: cannot listen on {addr}: {e}");
                    server_stop.store(true, Ordering::Relaxed);
                    return;
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
        });
    });

    if let Err(e) = input::run(tx, stop) {
        // Without the radio side there is nothing to serve, so leave without waiting for pages.
        eprintln!("station: {e}");
        std::process::exit(1);
    }
    let _ = server.join();
    println!("station: stopped.");
}
