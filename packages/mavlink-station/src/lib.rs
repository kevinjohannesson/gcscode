//! gcscode's station process (ADR-0016, a draft): the native process that will send everything
//! gcscode sends to vehicles. Its first job, rung GCS-38, sends nothing: it reads an EdgeTX radio
//! and serves the radio's raw input to the page over a WebSocket on 127.0.0.1 (ADR-0015, a draft).
//! The page only watches; whether a page is connected changes nothing for the process.

pub mod api;
pub mod input;
pub mod snapshot;
