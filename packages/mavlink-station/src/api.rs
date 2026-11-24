//! The page's side: a WebSocket on 127.0.0.1 that pushes the newest snapshot. Read only: what
//! a page sends is ignored, and a page connecting, falling behind or leaving changes nothing
//! for the rest of the process.

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use tokio::sync::watch;

use crate::snapshot::{Snapshot, hello_json, input_json};

/// Where gcscode's dev server serves the page.
pub const DEFAULT_ORIGINS: [&str; 2] = ["http://localhost:5173", "http://127.0.0.1:5173"];

/// The longest a connected page goes without a message, so it can tell a quiet radio from a
/// dead station.
const KEEPALIVE: Duration = Duration::from_secs(1);

/// Any website can open a WebSocket to localhost, so a browser's `Origin` must be one we
/// serve. A connection without one comes from a local program, not a web page.
pub fn origin_allowed(origin: Option<&str>, allowed: &[String]) -> bool {
    match origin {
        None => true,
        Some(o) => allowed.iter().any(|a| a == o),
    }
}

/// What the station prints when it refuses a page. The browser cannot see a 403's status, so
/// the page can only guess; the operator reads the answer here.
pub fn refusal_line(origin: &str) -> String {
    format!(
        "station: refused a page from {origin}; to serve it, restart the station with --allow-origin {origin}"
    )
}

#[derive(Clone)]
struct Shared {
    snapshots: watch::Receiver<Snapshot>,
    allowed: Arc<Vec<String>>,
}

pub fn router(snapshots: watch::Receiver<Snapshot>, allowed: Vec<String>) -> Router {
    Router::new().route("/ws", get(upgrade)).with_state(Shared {
        snapshots,
        allowed: Arc::new(allowed),
    })
}

async fn upgrade(State(s): State<Shared>, headers: HeaderMap, ws: WebSocketUpgrade) -> Response {
    let origin = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok());
    if !origin_allowed(origin, &s.allowed) {
        eprintln!("{}", refusal_line(origin.unwrap_or_default()));
        return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }
    ws.on_upgrade(move |socket| serve(socket, s.snapshots))
}

/// One page: `hello`, the current snapshot, then the newest snapshot after every change.
/// A page that falls behind skips to the newest; nothing queues up for it.
async fn serve(mut socket: WebSocket, mut snapshots: watch::Receiver<Snapshot>) {
    if socket.send(Message::Text(hello_json().into())).await.is_err() {
        return;
    }
    loop {
        let text = input_json(&snapshots.borrow_and_update());
        if socket.send(Message::Text(text.into())).await.is_err() {
            return;
        }
        tokio::select! {
            changed = snapshots.changed() => if changed.is_err() { return },
            _ = tokio::time::sleep(KEEPALIVE) => {}
            incoming = socket.recv() => match incoming {
                // A page sends nothing the station acts on in this protocol version.
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return,
                Some(Ok(_)) => {}
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed() -> Vec<String> {
        DEFAULT_ORIGINS.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn the_dev_server_is_allowed() {
        assert!(origin_allowed(Some("http://localhost:5173"), &allowed()));
        assert!(origin_allowed(Some("http://127.0.0.1:5173"), &allowed()));
    }

    #[test]
    fn another_website_is_refused() {
        assert!(!origin_allowed(Some("https://example.com"), &allowed()));
        assert!(!origin_allowed(Some("http://localhost:5174"), &allowed()));
        assert!(!origin_allowed(Some("null"), &allowed()));
    }

    #[test]
    fn a_refused_page_is_named_with_the_flag_that_serves_it() {
        assert_eq!(
            refusal_line("http://localhost:5174"),
            "station: refused a page from http://localhost:5174; to serve it, restart the station with --allow-origin http://localhost:5174"
        );
    }

    #[test]
    fn a_local_program_without_an_origin_is_allowed() {
        assert!(origin_allowed(None, &allowed()));
    }
}
