//! The page's WebSocket, served on a real port and spoken to like a browser would.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use mavlink_station::api::router;
use mavlink_station::snapshot::{Radio, Snapshot};
use radio_input::probe::{Inputs, RadioInfo};
use serde_json::{Value, json};
use tokio::net::TcpListener;
use tokio::sync::watch;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::{Error, Message};

const PAGE: &str = "http://localhost:5173";

async fn station(first: Snapshot) -> (String, watch::Sender<Snapshot>) {
    let (tx, rx) = watch::channel(first);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}/ws", listener.local_addr().unwrap());
    let app = router(rx, vec![PAGE.to_string()]);
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (url, tx)
}

type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn open(url: &str, origin: Option<&str>) -> Result<Socket, Error> {
    let mut request = url.into_client_request().unwrap();
    if let Some(o) = origin {
        request.headers_mut().insert("origin", o.parse().unwrap());
    }
    tokio_tungstenite::connect_async(request).await.map(|(s, _)| s)
}

async fn next(socket: &mut Socket) -> Value {
    let message = tokio::time::timeout(Duration::from_secs(3), socket.next())
        .await
        .expect("the station sends within 3 s")
        .expect("the socket stays open")
        .unwrap();
    match message {
        Message::Text(t) => serde_json::from_str(&t).unwrap(),
        other => panic!("expected text, got {other:?}"),
    }
}

fn radio(axis0: i16, button1: bool) -> Snapshot {
    Snapshot {
        radio: Some(Radio {
            info: RadioInfo {
                name: "TX16SMK3 Joystick".into(),
                vendor: 0x1209,
                product: 0x4f54,
                serial: Some("0123456789AB".into()),
            },
            inputs: Inputs {
                axes: vec![axis0, -32768],
                buttons: vec![false, button1],
                hats: vec![],
            },
        }),
        controls: None,
        events_per_second: Some(12),
    }
}

#[tokio::test]
async fn a_page_gets_hello_then_the_current_input() {
    let (url, _tx) = station(radio(100, true)).await;
    let mut page = open(&url, Some(PAGE)).await.unwrap();

    assert_eq!(
        next(&mut page).await,
        json!({"type": "hello", "protocol": 1, "station": "0.1.0"})
    );
    assert_eq!(
        next(&mut page).await,
        json!({
            "type": "input",
            "radio": {
                "name": "TX16SMK3 Joystick",
                "vendorId": 4617,
                "productId": 20308,
                "serial": "0123456789AB",
                "axes": [100, -32768],
                "buttons": [false, true],
                "hats": []
            },
            "controls": null,
            "eventsPerSecond": 12
        })
    );
}

#[tokio::test]
async fn a_change_reaches_the_page() {
    let (url, tx) = station(Snapshot::default()).await;
    let mut page = open(&url, Some(PAGE)).await.unwrap();
    next(&mut page).await;
    assert_eq!(
        next(&mut page).await,
        json!({"type": "input", "radio": null, "controls": null, "eventsPerSecond": null})
    );

    tx.send(radio(-5, false)).unwrap();
    let sent = std::time::Instant::now();
    let changed = next(&mut page).await;
    // Pushed on the change, not left for the 1 s keepalive.
    assert!(sent.elapsed() < Duration::from_millis(300), "took {:?}", sent.elapsed());
    assert_eq!(changed["radio"]["axes"], json!([-5, -32768]));
    assert_eq!(changed["radio"]["buttons"], json!([false, false]));
}

#[tokio::test]
async fn a_quiet_radio_still_sends_within_a_second_or_so() {
    let (url, _tx) = station(Snapshot::default()).await;
    let mut page = open(&url, Some(PAGE)).await.unwrap();
    next(&mut page).await;
    next(&mut page).await;
    // Nothing changes, yet the keepalive repeats the snapshot well inside next()'s 3 s.
    assert_eq!(next(&mut page).await["type"], "input");
}

#[tokio::test]
async fn another_website_is_refused() {
    let (url, _tx) = station(Snapshot::default()).await;
    match open(&url, Some("https://example.com")).await {
        Err(Error::Http(response)) => assert_eq!(response.status(), 403),
        other => panic!("expected a 403, got {other:?}"),
    }
}

#[tokio::test]
async fn a_page_leaving_changes_nothing_for_the_station() {
    let (url, tx) = station(radio(1, false)).await;

    let mut first = open(&url, Some(PAGE)).await.unwrap();
    next(&mut first).await;
    next(&mut first).await;
    first.close(None).await.unwrap();
    drop(first);

    // The station keeps taking input after the page has gone, and a new page sees the newest.
    tokio::time::sleep(Duration::from_millis(50)).await;
    tx.send(radio(2, true)).expect("the station still has a reader");
    let mut second = open(&url, Some(PAGE)).await.unwrap();
    next(&mut second).await;
    assert_eq!(next(&mut second).await["radio"]["axes"], json!([2, -32768]));

    // And a page that sends something is ignored, not answered with an error or a close.
    second.send(Message::Text("hi".into())).await.unwrap();
    assert_eq!(next(&mut second).await["type"], "input");
}
