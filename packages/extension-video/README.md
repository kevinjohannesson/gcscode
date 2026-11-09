# @gcscode/extension-video

The **Video** panel: it plays a drone camera's live stream. While it has no picture it shows one line in plain words (connecting, can't reach the server, no video yet, video lost) and keeps retrying every 3 seconds, so an operator never has to restart anything.

## The setting

`gcscode.video.whepUrl` is the address of the camera's stream (a WHEP endpoint, as served by MediaMTX). The default is `http://localhost:8889/drone-1/whep`.

The panel reads the setting once, when the extension activates, so a change takes effect after a reload. There is no settings editor yet. Until there is, change it from the browser's devtools: edit the `gcscode.configuration` entry in `localStorage` and reload, as described in [Operator UX in v1](../extension-api/README.md#operator-ux-in-v1):

```js
const cfg = JSON.parse(localStorage.getItem('gcscode.configuration') ?? '{}');
cfg['gcscode.video.whepUrl'] = 'http://localhost:8889/drone-2/whep';
localStorage.setItem('gcscode.configuration', JSON.stringify(cfg));
location.reload();
```

A value that fails the setting's schema is ignored on reload and the default applies, with no message in the UI.

## The seam

The panel does not know what carries the picture. `src/video-source.ts` defines the seam: `OpenVideoSession` opens a session and hands it a listener; the session reports `stream`, `picture`, and failures (`unreachable`, `no-stream`, `refused`, `dropped`, `unsupported`) and can be closed. `src/whep-session.ts` is the WHEP implementation. A different transport replaces it without touching the panel.

**Nothing in a session may throw.** `openWhepSession`, `close()` and the listener calls end in a report or in nothing; every WebRTC and `fetch` call is guarded. A browser without WebRTC reports `unsupported`, and the panel says so.

## What this package does not do

It never builds, parses or interprets a stream path, and never derives one from a vehicle or system ID. The address is an opaque string the operator configures; `drone-1` appears only inside the default value. Tying a stream to a vehicle is a separate decision (see [ADR-0014](../../docs/decisions/ADR-0014-protocols-as-languages.md)) and is not made here.
