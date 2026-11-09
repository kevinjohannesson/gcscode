# Video feed v0

**Date:** 2026-11-09
**Status:** Draft

A "Video" panel that plays a drone's live camera stream. The smallest cut that starts on the right footing: one panel, one package, one setting, and no published contract yet.

## Context

gcscode shows a drone on the map and its telemetry in the status bar, but not what its camera sees. The [roadmap](../roadmap.md)'s Video feed entry is that feature. Its test source is camera-sim (`tools/camera-sim`, on the owner's local branches, not yet on master): a fake camera payload that renders each SITL vehicle's view and publishes it as H.264 through a MediaMTX media server, one stream per vehicle named `drone-<sysid>`.

MediaMTX serves each stream to browsers over WebRTC using WHEP (WebRTC-HTTP Egress Protocol). The browser POSTs an SDP offer to `<server>/<stream>/whep`, gets the answer back in the response, and receives the video over a peer connection. Playback is well under a second behind the camera; HLS, the other way a browser plays live video, runs several seconds behind, which is too late for a live view.

Two decisions shape what "the right footing" means here:

- [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md): video is a domain concern, so it ships as an extension, not a host namespace.
- ADR-0014, "Protocols are like languages" (draft, [PR #44](https://github.com/kevinjohannesson/gcscode/pull/44)): the app and every generic feature know no protocol; each feature owns its contract, and protocols fill it in.

**The demo that proves v0:** SITL flies `tools/sitl/client/fly_circle.py`, the drone moves on the map, and its camera-sim video plays in the Video panel.

## Why not bigger

The brainstorm priced two cuts, and the owner chose the first.

- **A. One panel, one package.** The panel plays the stream at a WHEP address read from a setting. _Chosen (owner)._
- **B. A published contract plus a provider.** `extension-video` publishes a video-source contract and a second package, a WHEP/MediaMTX provider, fills it. That brings work A skips: a source registry; a statement of what happens to registered sources when the video service is disabled and re-enabled, which [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) requires of every service; a recovery path for a provider that registers once at `activate()`; a picker once two sources exist; and an activation-order note. Roughly two to three times A's code, and contract decisions with no second provider to test them against.

What B buys is a panel that knows no transport, and an obvious place for a `mavlink`-named extension to tie a stream to a vehicle. A keeps both reachable: the player takes a browser `MediaStream` and nothing else, and WHEP lives in one module beside it (see [The seam](#the-seam-the-player-plays-a-mediastream)), so publishing the contract later is a move, not a rewrite. The trigger for that move is recorded under [propagation](#docsout-of-scopemd-propagation).

## Goals

1. A panel titled **Video** plays the live stream at a configured WHEP address. The default is vehicle 1's camera-sim stream on the local MediaMTX.
2. The panel never shows a silent black box. When there is no picture it says why, in words an operator understands, and keeps retrying on its own.
3. The panel cleans up after itself: disabling the extension ends its session at MediaMTX.
4. The player takes a `MediaStream` and knows nothing about where it came from; WHEP is confined to one module.
5. The demo runs live, as described under [Validation](#validation).

## Non-goals

- **Controls of any kind.** No play/pause, snapshot, recording, fullscreen button, gimbal or zoom. The operator only watches. _(Owner.)_
- **Layout.** v0 does not place the panel. It opens as a dock tab like Map; to watch both, the operator drags one beside the other, as with any panel. _(Owner.)_
- **A published video-source contract, and any second way of getting video** (RTSP, HLS, a stream a camera announces over MAVLink). That is cut B, deferred with a trigger.
- **Tying a stream to a vehicle.** The panel plays an address. It does not know which vehicle, if any, the stream belongs to, and its title does not claim one. Per ADR-0014 that link belongs in a `mavlink`-named extension, which may read the MAVLink extension's exports; this one must not.
- **More than one stream, or more than one Video panel.**
- **Detecting a frozen picture.** A connected stream whose frames stop arriving (camera-sim's browser tab hidden, for example) looks exactly like a live one. camera-sim burns the UTC time into every frame, which is enough for v0. _(Owner.)_
- **Audio.** camera-sim sends none, and the video plays muted, which browsers require for autoplay.
- **MediaMTX in the repo.** It stays installed and started by hand. The roadmap's "MediaMTX in the repo" entry names Video feed v0 as its trigger; that trigger is declined, and the work stays a separate cut. _(My call, stated in the brainstorm without objection; the controller session recommended it.)_
- **A settings editor.** See [The settings-editor trigger](#the-settings-editor-trigger-fires-and-is-declined).

## Anti-goals

These would make v0 a failure even if the video plays:

- **A black panel with no words.** Every state without a picture explains itself.
- **Video knowledge in the host.** Nothing in `packages/shell` or `@gcscode/extension-api` learns about video, WHEP or MediaMTX. The only shell change is the `bundled-extensions.ts` entry and the package dependency that comes with it.
- **Reading MAVLink.** The extension imports no sibling extension, not even types, and reads no extension's exports.

## Design

### Package and contributions

- **Package:** `packages/extension-video`, published name `@gcscode/extension-video`, exporting `videoExtension` (the slug convention in `CLAUDE.md`).
- **Manifest:** id `gcscode.video`, displayName `Video`, version `0.0.0`, and a one-line description in operator terms (the builder's wording).
- **One view:** id `gcscode.video.main`, title `Video`.
- **One setting:** `gcscode.video.whepUrl`, schema `{ type: 'string', format: 'uri' }`, default `http://localhost:8889/drone-1/whep`. It mirrors `gcscode.sitl.connectionUrl`: when the setting changes (`onDidChangeConfiguration` with `affectsConfiguration('gcscode.video.whepUrl')`), an open panel hangs up and connects to the new address. Edits made in devtools need a reload, as for every setting today.
- **No exports.** `activate()` returns nothing. No status-bar item, command or keybinding.
- **Bundling:** one entry in `packages/shell/src/extension-host/bundled-extensions.ts`, placed before `mapExtension`. Its position is not an activation constraint, because it reads no extension's exports and publishes none. What the position does decide is the tab order: the shell adds dock panels in the order views are registered, dockview makes each new panel the front tab of its group, and layout is not saved, so whichever view registers last is in front at every load. Listing Video before Map keeps Map in front, as it is today. The entry's comment says exactly that. _(My call.)_

The package mirrors an existing extension's layout (`package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`); `packages/extension-vehicle-status` is the nearest template.

### The connection belongs to the panel

The panel's component opens the connection when it mounts and closes it when it unmounts. No connection lives at module level, so none can outlive the panel. Operators cannot close a dock tab in gcscode (the shell's tab component hides the close button: "Extensions own panel lifecycle in gcscode; users do not close panels"), so the one way a Video panel goes away is the extension being disabled. Disabling removes the extension's view from the host's registry, the shell removes the dock panel, the component unmounts, and the connection closes. `deactivate()` is not needed.

The component needs the host's configuration, and a view component receives no props (the shell's view host renders it bare). It reaches the host the way `extension-map` does, through a module-level reference set in `activate()` (`packages/extension-map/src/host-store.ts`). Such module state survives a failed activation, so it must tolerate being set again on the next load, per the extension API README's activation-failure section. The exact shape is the builder's.

### The seam: the player plays a MediaStream

The package has two parts, and the line between them is what a later contract would lift out.

- **The WHEP session**, in one module. Given a URL, it creates an `RTCPeerConnection` with one receive-only video transceiver, POSTs the offer with `Content-Type: application/sdp`, applies the answer, and yields the remote `MediaStream`. It reports how it failed: the server could not be reached (`fetch` rejects), no stream at that address (HTTP 404), another HTTP error, or the connection dropping (see [When the video counts as lost](#when-the-video-counts-as-lost)). `close()` sends `DELETE` to the session URL taken from the response's `Location` header, resolved against the WHEP URL, when that header is readable; it always closes the peer connection; and a second call does nothing. ICE is non-trickle: the session waits for candidate gathering to complete before POSTing, which is immediate with host candidates on one machine or a LAN. _(My call: trickle ICE needs `PATCH` requests and an ETag, for no gain locally.)_
- **The panel**: a Svelte component plus a state class (per `.claude/rules/svelte.md`, state with lifecycle meaning lives in a class). It owns at most one session at a time, the retry timer, and what the operator sees, and it sets the `<video>` element's `srcObject`. It knows nothing about SDP or HTTP.

### What the operator sees

| State                     | The panel shows                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| Connecting                | "Connecting to video…"                                                                         |
| Playing                   | The video, filling the panel with its aspect ratio kept (letterboxed). No text over the video. |
| Server unreachable        | "Can't reach the video server at `<address>`. Retrying…"                                       |
| No stream at that address | "No video at `<address>` yet. Retrying…"                                                       |
| Other HTTP error          | "The video server refused (`<status>`). Retrying…"                                             |
| No picture in time        | "Connected, but no picture arrived. Retrying…"                                                 |
| Lost after playing        | "Video lost. Reconnecting…"                                                                    |

The exact wording is the builder's, in operator terms, but the failure lines show the address, so a wrong setting is visible without devtools.

**Playing starts at the first decoded frame**, not when the WebRTC track arrives: the panel watches its `<video>` element for the first frame, and "Connecting…" stays up until then. A track that never decodes would otherwise be the black box the anti-goals rule out.

**Connect timeout:** an attempt that has no decoded frame 10 seconds after it started fails as "no picture in time". That covers a connection that fails before any track arrives (blocked UDP between machines, say) as well as a track that arrives but never decodes (a missing keyframe, or a browser that can't decode H.264). A connection that drops before the first frame counts here too, not as "lost". _(My call.)_

**Retry:** 3 seconds after any failure, fixed, with no back-off and no giving up. _(My call: on a local link the requests are cheap, and a monitoring panel should recover by itself when the camera comes back.)_

### When the video counts as lost

The session reports a drop, and the panel decides what it means: before the first decoded frame it is "no picture in time", after it the video is lost. A drop is any of: the peer connection's `connectionState` becoming `failed` or `closed` other than by the panel's own hang-up, the video track ending, or `connectionState` staying `disconnected` for 5 seconds. A `disconnected` state that recovers within 5 seconds changes nothing, so a short network blip doesn't force a reconnect and a wait for the next keyframe. _(My call.)_

The cost, accepted: when the server goes away the picture freezes until the browser notices. Browsers report `disconnected` within a few seconds of the other end going silent, so the panel should say "Video lost" within about 10 seconds. `failed` alone can take around half a minute. Until then the frozen frame looks live, which the non-goals already accept for v0, with camera-sim's clock as the tell.

### Tab switching

The dock's default renderer (dockview's `onlyWhenVisible`) takes a hidden tab's content out of the page without unmounting it, and the HTML spec has the browser pause a media element that leaves the page. The session stays open while the tab is hidden, and the picture must resume when the tab is shown again. _(My call: reconnecting costs a round trip and a wait for the next keyframe, while holding one viewer at a local MediaMTX costs nothing.)_ How the component notices it is visible again is the builder's call: it receives no dockview panel API.

### Decision: a generic feature that speaks WHEP (ADR-0014)

ADR-0014 says no generic feature knows a protocol, and this one speaks WHEP. That is a deliberate bend, which comes with the owner's choice of cut A:

- **What ADR-0014 guards against is a vehicle protocol's vocabulary spreading through the app;** its example is the vehicle's own flight-mode words being replaced by generic ones. WHEP carries no vehicle vocabulary. It is how a browser receives a live stream, and what it yields is a browser `MediaStream`. Nothing in the extension knows MAVLink or system IDs. MediaMTX's path convention (`drone-<sysid>`) appears only in the default setting value.
- **The bend is contained.** WHEP lives in one module, and nothing outside the package can see it, because the package exports no API.
- **The trigger for publishing the contract** is a second way of getting video (another transport, or a camera announcing its own stream), or the first stream tied to a vehicle. `extension-video` then publishes a video-source contract per [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s mechanics, and the WHEP module moves out to become the first provider.

The package is named for the feature (`extension-video`), not the transport (`extension-whep-video`), because that name survives the move. _(My call.)_

### Decision: a domain extension with no exports (ADR-0012)

Video is a domain concern, so it is an extension. v0 publishes no service API because nothing consumes one. When the trigger above fires, the contract goes into this package's exports, types from its entry point and the live API through `activate()`'s return value, per [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md).

### The settings-editor trigger fires, and is declined

The [`docs/out-of-scope.md`](../out-of-scope.md) row for the settings editor names "a second real setting consumer landing" as one of its triggers. `gcscode.video.whepUrl` is the second, after `gcscode.sitl.connectionUrl`. The trigger fires and is declined: both settings are addresses fixed by how the system is installed, not something an operator changes while flying. The propagation below sharpens the trigger to "the first setting an operator is expected to change in normal use". _(My call.)_

## Validation

### Automated

Vitest, co-located tests, in the `node` environment like the other extension packages, with fakes for `fetch` and `RTCPeerConnection`. Every expected value below comes from this spec.

1. **Activation.** `activate()` registers the view `gcscode.video.main` titled `Video` and the setting `gcscode.video.whepUrl` with default `http://localhost:8889/drone-1/whep`, pushes every disposable to `context.subscriptions`, and returns `undefined`.
2. **WHEP offer and answer.** The session POSTs to the given URL with `Content-Type: application/sdp` and the offer's SDP as the body, applies the answer from the response, and yields the remote stream.
3. **WHEP failures.** A rejected `fetch` reports "server unreachable"; a 404 reports "no stream"; any other non-2xx status reports that status. After the stream arrived, `connectionState` `failed` or `closed`, or the track ending, reports "dropped" at once; `disconnected` reports it only after 5000 ms, and not at all if the state recovers sooner (fake timers). The panel's own `close()` reports nothing.
4. **WHEP close.** `close()` sends `DELETE` to the `Location` URL resolved against the WHEP URL, closes the peer connection, and is a no-op the second time. Closing before the answer arrives leaves no peer connection open, and the late answer is ignored.
5. **Panel state** (fake timers throughout). Connecting until the first decoded frame, then playing. No decoded frame 10000 ms after the attempt began: "no picture in time". A drop before the first frame is also "no picture in time"; a drop after it is "lost". After any failure, a new attempt after exactly 3000 ms. A setting change closes the current session and opens one to the new address. Unmounting closes the session, and no timer fires afterwards.

Each test is seen failing before it passes, per `CLAUDE.md`.

### Live, recorded in the feat PR

- **The demo.** SITL at `--streamrate 25`, camera-sim running in a visible window, MediaMTX started by hand, `fly_circle.py` flying. The drone moves on Map, and its video plays in Video, with the two panels side by side.
- **Late camera.** gcscode is started before camera-sim. The panel says there is no video yet, and plays within about 3 seconds of camera-sim publishing.
- **Server restart.** Stopping MediaMTX mid-flight makes the panel say "Video lost" within about 10 seconds; restarting MediaMTX brings the picture back without a reload. The measured time to "Video lost" goes in the PR.
- **Tab switching.** With Map and Video as tabs in one group (Map in front at load), switching to Video and back and forth resumes the picture each time.
- **Clean hang-up.** Disabling the extension from the extensions panel removes the Video panel and ends the session; MediaMTX's log shows the reader closing. Re-enabling it brings the panel back and playing.

## VS Code alignment

| Concern                                   | VS Code                                                                                                  | gcscode                                                                                                                                                 | Status                                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Showing media in a panel                  | No native video surface; an extension renders `<video>` inside a webview view                            | A Svelte component in a dock panel through `host.window.registerView`, in the app's own page                                                            | Divergence, existing: the ledger's "View / status-bar contributions" row ([ADR-0005](../decisions/ADR-0005-extension-boundaries.md)). A further use, not new |
| An endpoint as a setting                  | `contributes.configuration` read with `getConfiguration().get`                                           | `registerConfiguration` read with `getConfiguration().get`, reconnecting on `onDidChangeConfiguration`                                                  | Existing rows (configuration v1); a further use                                                                                                              |
| The core knows no language or protocol    | The core knows no language; each language fills provider contracts                                       | A generic feature speaks WHEP, confined to one module, with no contract published                                                                       | Divergence, decided here                                                                                                                                     |
| A feature publishes a contract to fill    | The former Test Explorer UI extension published the Test Adapter API (ADR-0014's own example)            | Deferred until a second way of getting video, or a stream tied to a vehicle                                                                             | Deferred                                                                                                                                                     |
| What happens to a hidden panel's contents | A webview view's contents are destroyed when hidden, unless the extension sets `retainContextWhenHidden` | The dock keeps the component mounted and only takes it out of the page; the Video panel keeps its session open and resumes the picture when shown again | Divergence: the mounting behaviour is dockview's; keeping the session open is decided here                                                                   |

## `docs/out-of-scope.md` propagation

These land when the iteration ships, after ADR-0014's PR has merged and the feat branch is rebased on master. Until then the feat PR body lists them.

1. **Add: Video-source contract.** "Video feed publishes no video-source contract; its panel speaks WHEP itself, in one module. _Trigger to revisit:_ a second way of getting video (another transport, or a camera announcing its own stream), or the first stream tied to a vehicle. Then `extension-video` publishes the contract and the WHEP module becomes its first provider." Cites this spec.
2. **Add: Tying a video stream to a vehicle.** "The Video panel plays an address and does not know which vehicle it belongs to. Per ADR-0014 the link belongs in a `mavlink`-named extension. _Trigger to revisit:_ the first flight with more than one vehicle that needs video, or a real camera announcing its stream over MAVLink." Cites this spec.
3. **Add: Detecting a frozen picture.** "A connected stream whose frames stop looks live; v0 relies on the camera burning its own clock into the frame. _Trigger to revisit:_ the first video source with no burned-in clock (any real camera), or an operator misled by a frozen frame." Cites this spec.
4. **Amend: Settings editor UI.** Replace the trigger "a second real setting consumer landing" with "the first setting an operator is expected to change in normal use", and note that the second consumer (`gcscode.video.whepUrl`, an installation address) fired the old wording and was declined here.

## `docs/roadmap.md` propagation

- **Video feed:** tick it with a shipped note saying what v0 contains (one panel, one stream from a configured WHEP address, retrying with an explanation) and what it does not (the contract, vehicle linkage, frozen-picture detection, each with its `out-of-scope.md` row). Drop "Likely a Phase C streaming-source consumer alongside SITL", which v0 does not bear out.
- **MediaMTX in the repo:** its trigger "Video feed v0" fired and was declined, so the trigger becomes "a second machine needing the same media setup, or the first video iteration that needs MediaMTX configured beyond its defaults".

## `docs/vs-code-alignment.md` propagation

Copy the three rows not marked "existing" from the table above: the protocol divergence, the deferred contract, and the hidden-panel row.

## Known unknowns

- **Whether MediaMTX lets a page read the `Location` header.** Its CORS preflight allows the gcscode origin (checked 2026-11-09 against the running server: an `OPTIONS` from `http://localhost:5173` came back with a matching `Access-Control-Allow-Origin`). Reading `Location` from the 201 response also needs `Access-Control-Expose-Headers`, which is unverified. If the header can't be read, `close()` only closes the peer connection, and MediaMTX ends the session once it notices; the live check measures how long that takes.
- **Whether a `<video>` put back into the page resumes by itself**, or needs `play()`.
- **Whether gcscode's own tab being hidden matters.** Browsers throttle hidden pages. Receiving and decoding should carry on, but this is unverified; camera-sim's freezing is on the encoding side.
- **Latency is not measured.** camera-sim's burned-in UTC time can be read against a clock during the demo. No target is set.
- **Whether WHEP is a "protocol" in ADR-0014's sense.** This spec records the call for v0 (see [the decision](#decision-a-generic-feature-that-speaks-whep-adr-0014)); ADR-0014 itself does not say.
- **H.264 decoding.** camera-sim's encoder sends H.264, and the browser running gcscode must decode it. Chrome and Safari do; other browsers are unverified.

## Post-merge implementation

Code, so a `feat/video-feed` branch through the subagent-driven pipeline, reviewed per the `review-loop` skill. The plan lists the Known unknowns above as checklist items. camera-sim is not edited; if the feature needs anything from it, the controller session is told. ADR-0014's follow-up PRs rename `extension-sitl` and `extension-flight-overlay`, so a trivial conflict in `bundled-extensions.ts` is expected. The repo-state claims here (the shell's view host passes no props, dockview's default renderer, `gcscode.sitl.connectionUrl` as the only other setting, `extension-map`'s host store) were checked while writing; the implementer re-checks rather than trusting them.

## Origin

Brainstormed with the owner on 2026-11-09, in a desktop session started by the controller session that coordinates the video feed and manual control extensions.
