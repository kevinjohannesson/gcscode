//! gcscode-station: reads an EdgeTX radio and serves its raw input to the gcscode page on
//! ws://127.0.0.1:8091/ws. Sends nothing to any vehicle.

use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use mavlink_station::{api, input, snapshot::Snapshot};
use radio_input::mapping::Profile;
use tokio::sync::watch;

const PORT: u16 = 8091;
const USAGE: &str = "usage: gcscode-station [--allow-origin <origin>]... [--profile <file>]...";

/// What the command line asks for, in the order it was given.
#[derive(Debug, PartialEq)]
struct Args {
    /// Origins allowed besides the default ones.
    origins: Vec<String>,
    /// Profile files, tried before the bundled profiles.
    profiles: Vec<String>,
}

/// Reads the arguments after the program name, or gives the usage line.
fn parse_args(args: impl IntoIterator<Item = String>) -> Result<Args, &'static str> {
    let mut parsed = Args {
        origins: Vec::new(),
        profiles: Vec::new(),
    };
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            // pnpm passes the `--` of `pnpm start -- <args>` on to the station. A `--` anywhere
            // is skipped, as radio-probe does.
            "--" => {}
            "--allow-origin" => parsed.origins.push(args.next().ok_or(USAGE)?),
            "--profile" => parsed.profiles.push(args.next().ok_or(USAGE)?),
            _ => return Err(USAGE),
        }
    }
    Ok(parsed)
}

fn main() {
    let args = match parse_args(std::env::args().skip(1)) {
        Ok(a) => a,
        Err(usage) => {
            eprintln!("{usage}");
            std::process::exit(2);
        }
    };
    let mut allowed: Vec<String> = api::DEFAULT_ORIGINS.iter().map(|s| s.to_string()).collect();
    allowed.extend(args.origins);
    // Profiles given with --profile are tried before the bundled ones.
    let mut profiles = Vec::new();
    for file in &args.profiles {
        match load_profile(file) {
            Ok(p) => profiles.push(p),
            Err(e) => {
                eprintln!("station: {e}");
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

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Result<Args, &'static str> {
        parse_args(args.iter().map(|a| a.to_string()))
    }

    #[test]
    fn it_skips_the_double_dash_that_pnpm_passes_on() {
        assert_eq!(
            parse(&["--", "--profile", "refused.toml"]),
            Ok(Args {
                origins: vec![],
                profiles: vec!["refused.toml".to_string()]
            })
        );
        assert_eq!(
            parse(&[
                "--",
                "--allow-origin",
                "http://a",
                "--",
                "--profile",
                "x.toml"
            ]),
            Ok(Args {
                origins: vec!["http://a".to_string()],
                profiles: vec!["x.toml".to_string()]
            })
        );
    }

    #[test]
    fn it_reads_origins_and_profiles_in_order() {
        assert_eq!(
            parse(&[
                "--allow-origin",
                "http://a",
                "--profile",
                "x.toml",
                "--profile",
                "y.toml"
            ]),
            Ok(Args {
                origins: vec!["http://a".to_string()],
                profiles: vec!["x.toml".to_string(), "y.toml".to_string()],
            })
        );
        assert_eq!(
            parse(&[]),
            Ok(Args {
                origins: vec![],
                profiles: vec![]
            })
        );
    }

    #[test]
    fn it_gives_the_usage_line_for_anything_else() {
        assert_eq!(parse(&["--port", "1"]), Err(USAGE));
        assert_eq!(parse(&["--profile"]), Err(USAGE));
        assert_eq!(parse(&["--allow-origin"]), Err(USAGE));
    }
}
