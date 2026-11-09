# Video feed v0

**Date:** 2026-11-09
**Status:** Draft

A "Video" panel that plays a drone's live camera stream. The smallest cut that starts on the right footing: one panel, one package, one setting, and no published contract yet.

## Context

gcscode shows a drone on the map and its telemetry in the status bar, but not what its camera sees. The [roadmap](../roadmap.md)'s Video feed entry is that feature. Its test source is camera-sim (`tools/camera-sim`, on the owner's local branches, not yet on master): a fake camera payload that renders each SITL vehicle's view and publishes it as H.264 through a MediaMTX media server, one stream per vehicle named `drone-<sysid>`.

MediaMTX serves each stream to browsers over WebRTC using WHEP (WebRTC-HTTP Egress Protocol). The browser POSTs an SDP offer to `<server>/<stream>/whep`, gets the answer back in the response, and receives the video over a peer connection. Playback is well under a second behind the camera; HLS, the other way a browser plays live video, runs several seconds behind, which is too late for a live view.

Two decisions shape what "the right footing" means here:

- [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md): video is a domain concern, so it ships as an extension, not a host namespace.
- [ADR-0014](../decisions/ADR-0014-protocols-as-languages.md), "Protocols are like languages" (accepted): the app and every generic feature know no protocol; each feature owns its contract, and protocols fill it in. How this spec reads it for a video transport is [a decision below](#decision-whep-is-a-transport-not-a-vehicle-protocol-adr-0014).

**The demo that proves v0:** SITL flies `tools/sitl/client/fly_circle.py`, the drone moves on the map, and its camera-sim video plays in the Video panel.

## Why not bigger

The brainstorm priced two cuts, and the owner chose the first.

- **A. One panel, one package.** The panel plays the stream at a WHEP address read from a setting. _Chosen (owner)._
- **B. A published contract plus a provider.** `extension-video` publishes a video-source contract and a second package, a WHEP/MediaMTX provider, fills it. That brings work A skips: a source registry; a statement of what happens to registered sources when the video service is disabled and re-enabled, which [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) requires of every service; a recovery path for a provider that registers once at `activate()`; a picker once two sources exist; and an activation-order note. Roughly two to three times A's code, and contract decisions with no second provider to test them against.

What B buys is a panel that knows no transport, and the contract through which a vehicle's own source could one day offer that vehicle's stream ([ADR-0014](../decisions/ADR-0014-protocols-as-languages.md) Decision 2). A keeps both reachable: the panel takes a browser `MediaStream` plus transport-neutral reports and nothing else, and WHEP lives in one module beside it (see [The seam](#the-seam-the-panel-plays-a-mediastream)), so publishing the contract later is a move, not a rewrite. The trigger for that move is recorded under [propagation](#docsout-of-scopemd-propagation).

## Goals

1. A panel titled **Video** plays the live stream at a configured WHEP address. The default is vehicle 1's camera-sim stream on the local MediaMTX.
2. The panel never shows a silent black box. When there is no picture it says why, in words an operator understands, and keeps retrying on its own wherever retrying can help.
3. The panel cleans up after itself: disabling the extension ends its session at MediaMTX.
4. The panel knows nothing about the transport. It receives a `MediaStream`, a first-picture signal and failure reports in transport-neutral terms; WHEP is confined to one module.
5. The demo runs live, as described under [Validation](#validation).

## Non-goals

- **Controls of any kind.** No play/pause, snapshot, recording, fullscreen button, gimbal or zoom. The operator only watches. _(Owner.)_
- **Layout.** v0 does not place the panel. It opens as a dock tab like Map; to watch both, the operator drags one beside the other, as with any panel. _(Owner.)_
- **A published video-source contract, and any second way of getting video** (RTSP, HLS, a stream a camera announces over MAVLink). That is cut B, deferred with a trigger.
- **Tying a stream to a vehicle.** The panel plays an address. It does not know which vehicle, if any, the stream belongs to, and its title does not claim one. Under [ADR-0014](../decisions/ADR-0014-protocols-as-languages.md) the end state is `extension-video`'s own contract, asked about one asset key at a time and answered only by that key's source (Decision 2): the MAVLink extension, for example from a camera announcing its stream. A `mavlink`-named add-on reading the MAVLink extension's exports would be a stopgap on the way there (Decision 3). This extension reads neither.
- **More than one stream, or more than one Video panel.**
- **Detecting a frozen picture.** A connected stream whose frames stop arriving (camera-sim's browser tab hidden, for example) looks exactly like a live one. camera-sim burns the UTC time into every frame, which is enough for v0. _(Owner.)_
- **Audio.** camera-sim sends none, and the video plays muted, which browsers require for autoplay.
- **Applying a setting change without a reload.** Nothing in v0 changes the setting at runtime: nothing in the repo calls `configuration.update()` for it, there is no settings editor, and devtools edits need a reload anyway. The address is read once, in `activate()`.
- **Releasing the stream while the panel is hidden.** The panel holds its session from load, whether or not the operator ever looks at it. That costs nothing against a local MediaMTX.
- **MediaMTX in the repo.** It stays installed and started by hand. The roadmap's "MediaMTX in the repo" entry names Video feed v0 as its trigger; that trigger is declined, and the work stays a separate cut. _(My call, stated in the brainstorm without objection; the controller session recommended it.)_
- **A settings editor.** See [The settings-editor trigger](#the-settings-editor-trigger-fires-and-is-declined).

## Anti-goals

These would make v0 a failure even if the video plays:

- **A black panel with no words.** Every state without a picture explains itself.
- **Video knowledge in the host.** Nothing in `packages/shell` or `@gcscode/extension-api` learns about video, WHEP or MediaMTX. The only shell changes are the `bundled-extensions.ts` entry, the package dependency that comes with it, and the `bundled-extensions.test.ts` assertion that pins the entry's position (see Bundling).
- **Reading MAVLink.** The extension imports no sibling extension, not even types, and reads no extension's exports.
- **Reaching around the API into the dock.** The package imports neither `dockview-svelte` nor `dockview-core` and never calls `getDockviewContext()`, though both would lint clean today (see [Tab switching](#tab-switching)).
- **A component that can throw.** A throw while the shell mounts a view escapes into the shell's panel-sync effect and stops every later panel from appearing, Map's included, with no activation failure recorded (see [Nothing in the panel throws](#nothing-in-the-panel-throws)).

## Design

### Package and contributions

- **Package:** `packages/extension-video`, published name `@gcscode/extension-video`, exporting `videoExtension` (the slug convention in `CLAUDE.md`).
- **Manifest:** id `gcscode.video`, displayName `Video`, version `0.0.0`, and a one-line description in operator terms (the builder's wording).
- **One view:** id `gcscode.video.main`, title `Video`.
- **One setting:** `gcscode.video.whepUrl`, schema `{ type: 'string', format: 'uri' }`, default `http://localhost:8889/drone-1/whep`. `activate()` registers it, pushes the disposable to `context.subscriptions`, reads it once and hands the address to the panel through module state. There is no change listener: a change applies on the next load (see Non-goals).
- **No exports.** `activate()` returns nothing. No status-bar item, command or keybinding.
- **Bundling:** one entry in `packages/shell/src/extension-host/bundled-extensions.ts`, placed before `mapExtension`, so that **Map stays the tab every load opens on**, as it is today. _(Owner.)_ The shell adds dock panels in the order views are registered, dockview makes each new panel the front tab of its group, and layout is not saved, so whichever view registers last is in front at every load. The position is not an activation constraint (Video reads no extension's exports and publishes none), but it is a requirement for what the operator sees, so `bundled-extensions.test.ts` pins Video before Map beside its existing map-before-flight-overlay assertion, and that test's name and comment stop calling map-before-flight-overlay "the one position in this list that is a requirement". The entry's comment says why it is where it is. Video therefore connects while its tab is hidden at load, which the probe measured as working (Known unknowns). Its mount comes ahead of Map's, which is one more reason [nothing in the panel throws](#nothing-in-the-panel-throws).

The package mirrors an existing extension's layout (`package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`); `packages/extension-vehicle-status` is the nearest template.

### The stream path is never built from a system ID

`extension-video` never builds, parses or interprets the stream path. In particular it never derives it from a MAVLink system ID, and never reads one out of it. MediaMTX's and camera-sim's `drone-<sysid>` convention appears only inside the default setting value, as an opaque string. Building `drone-${sysid}` in this package would make it know a vehicle protocol, which is exactly what [ADR-0014](../decisions/ADR-0014-protocols-as-languages.md) Decision 1 forbids. _(Owner.)_

### The connection belongs to the panel

The panel's component opens the connection when it mounts and closes it when it unmounts. No connection lives at module level, so none can outlive the panel. Operators cannot close a dock tab in gcscode (the shell's tab component hides the close button: "Extensions own panel lifecycle in gcscode; users do not close panels"), so the one way a Video panel goes away is the extension being disabled. Disabling removes the extension's view from the host's registry, the shell removes the dock panel, the component unmounts, and the connection closes. `deactivate()` is not needed.

The component needs only the address, and a view component receives no props (the shell's view host renders it bare), so `activate()` puts the address in module state and the component reads it there. The component holds no reference to the host and subscribes to nothing on it, so nothing it could leak lives outside `context.subscriptions`. The module state survives a failed or repeated activation, so `activate()` overwrites it every time, per the extension API README's activation-failure section.

### The seam: the panel plays a MediaStream

The package has two parts, and the line between them is what a later contract would lift out.

**The WHEP session**, in one module. Given a URL, it creates an `RTCPeerConnection` with one receive-only video transceiver, POSTs the offer with `Content-Type: application/sdp`, applies the answer, and yields the remote `MediaStream`. ICE is non-trickle: the session waits for candidate gathering to complete before POSTing, which is immediate with host candidates on one machine or a LAN. _(My call: trickle ICE needs `PATCH` requests and an ETag, for no gain locally.)_ The session owns two timers: the `getStats()` poll behind the picture report, which stops at the picture report, and the 5-second `disconnected` timer. `close()` stops both; sends `DELETE` to the session URL taken from the response's `Location` header, resolved against the WHEP URL; always closes the peer connection; and does nothing on a second call. After `close()` the session calls nothing on the peer connection and reports nothing. MediaMTX lets a page on another origin read that header (measured, see Known unknowns), so the `DELETE` is the normal path; if a server hides the header, closing the peer connection alone still ends the session once the server notices.

**What the session reports to the panel** is the seam itself, in transport-neutral terms, so a later provider of another kind can report the same things:

| Report      | Meaning                                                               | v0's WHEP session sends it when                                                                                               |
| ----------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| stream      | Here is the `MediaStream` to play                                     | the remote track arrives                                                                                                      |
| picture     | The first frame has been decoded                                      | the video receiver's `framesDecoded` statistic (`getStats()`, polled) first goes above zero                                   |
| unreachable | The source could not be reached                                       | `fetch` rejects                                                                                                               |
| no-stream   | The source is there but has nothing to play at that address           | HTTP 404                                                                                                                      |
| refused     | The source refused, with a short detail the panel shows as is         | any other non-2xx status (detail: the status code)                                                                            |
| dropped     | The connection ended on the far side                                  | `connectionState` becomes `failed`, the video track ends, or `connectionState` stays `disconnected` for 5 seconds (see below) |
| unsupported | This browser cannot play the source at all, so retrying will not help | `RTCPeerConnection` does not exist, or constructing it throws                                                                 |

Each failure report carries the source's label for the panel to show; for v0 that label is the address. The first-picture signal is the session's, not the `<video>` element's, because it must work while the panel is out of the page: decoding carries on off-page and while the element is paused (measured, see Known unknowns).

**The panel** is a Svelte component plus a state class (per `.claude/rules/svelte.md`, state with lifecycle meaning lives in a class). It owns at most one session at a time, the connect timeout, the retry timer, and what the operator sees; it sets the `<video>` element's `srcObject` from the stream report. It knows nothing about SDP, HTTP or status codes: a refusal's detail is text it displays without reading.

### What the operator sees

| State              | The panel shows                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Connecting         | "Connecting to video…"                                                                         |
| Playing            | The video, filling the panel with its aspect ratio kept (letterboxed). No text over the video. |
| Unreachable        | "Can't reach the video server at `<label>`. Retrying…"                                         |
| No stream          | "No video at `<label>` yet. Retrying…"                                                         |
| Refused            | "The video server refused (`<detail>`). Retrying…"                                             |
| No picture in time | "Connected, but no picture arrived. Retrying…"                                                 |
| Lost               | "Video lost. Reconnecting…"                                                                    |
| Unsupported        | "This browser can't play this video." No retry.                                                |

The exact wording is the builder's, in operator terms, but the failure lines show the label, so a wrong address is visible without devtools.

**Playing starts at the session's picture report**, not when the stream arrives. "Connecting…" stays up until then, so a stream that never decodes cannot become the black box the anti-goals rule out.

**Connect timeout:** an attempt with no picture report 15 seconds after it started fails as "no picture in time". That covers a connection that fails before any track arrives (blocked UDP between machines, say) and a track that never decodes (a missing keyframe, or a codec the browser cannot decode). A drop before the picture report also counts as "no picture in time", not as "lost". _(My call: the probe measured 6.2 seconds to the first picture for the first reader of a fresh stream, so 10 seconds left too little margin; the live demo measures camera-sim's figure.)_

**Retry:** 3 seconds after any failure except "unsupported", fixed, with no back-off and no giving up. _(My call: on a local link the requests are cheap, and a monitoring panel should recover by itself when the camera comes back.)_

### When the video counts as lost

After the picture report, a drop means the video is lost. A drop is the peer connection's `connectionState` becoming `failed`, the video track ending, or `connectionState` staying `disconnected` for 5 seconds. A `disconnected` state that recovers within 5 seconds changes nothing, so a short network blip doesn't force a reconnect and a wait for the next keyframe. `closed` is not a drop: a peer connection reaches it only through its own page's `close()`. _(My call.)_

The cost, accepted: when the server goes away the picture freezes until the browser notices. Browsers report `disconnected` within a few seconds of the other end going silent, so the panel should say "Video lost" within about 10 seconds. `failed` alone can take around half a minute. Until then the frozen frame looks live, which the non-goals already accept for v0, with camera-sim's clock as the tell.

### Tab switching

The dock's default renderer (dockview's `onlyWhenVisible`) takes a hidden tab's content out of the page without unmounting it. The probe measured what that does to a playing `<video>`: the browser pauses it, the connection stays up and frames keep decoding, and when the element is put back it stays paused until `play()` is called. So the session stays open while the tab is hidden, and the panel calls `play()` when its element is back in the page and paused. _(My call to keep the session: reconnecting costs a round trip and a wait for the next keyframe, while holding one viewer at a local MediaMTX costs nothing.)_

**The panel learns this from its own element only:** an `IntersectionObserver` on the `<video>` reports it coming back into view. The host offers no visibility signal; `ViewContribution` is `{ id, component, title }`. The dock's own panel API is reachable from any extension view through dockview-svelte's `getDockviewContext()`, and it would give `onDidVisibilityChange`, but it also hands over `containerApi`, the shell's whole layout API, and it ties the extension to the library and renderer the shell happens to use. That is reaching around the API, so it is ruled out (Anti-goals). A host visibility signal would be a platform concern under [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md), landing in `@gcscode/extension-api` first; it is deferred with a trigger (propagation below). _(Decided here.)_

### Nothing in the panel throws

The shell mounts a view inside dockview's `addPanel`, which runs inside the panel-sync `$effect` in `packages/shell/src/app.svelte`. A throw during the component's mount escapes that effect: later panels are never added, the effect stops re-running for the session, and no activation failure is recorded, so every reload repeats it while Video stays enabled. A throw from a view's own effects or `onMount` escapes a later effect flush instead, equally uncontained and unrecorded. View mounting and rendering are not contained by the host. Video is not the only view at risk: Map and Map demo construct a `maplibregl.Map` in `onMount` with nothing catching it, and MapLibre's constructor throws when it cannot get a WebGL context.

So the component cannot throw by construction, at mount or later. WebRTC and `fetch` start inside an effect, run inside `try`/`catch` or promise handlers, and every failure ends in a panel state, including "unsupported" for a browser without usable WebRTC. The host gap itself is recorded as an `out-of-scope.md` row (propagation below).

### Decision: WHEP is a transport, not a vehicle protocol (ADR-0014)

[ADR-0014](../decisions/ADR-0014-protocols-as-languages.md) Decision 1 says no generic feature knows a protocol. This spec reads "protocol" there as a **vehicle protocol**: the language in which a vehicle reports what it is and what it is doing, and takes commands. Under that reading `extension-video` speaking WHEP is within the ADR, not an exception to it:

- **The ADR's subject is vehicle protocols.** Its Context is about a shared model of what a vehicle is and does, whose generic words displace the ones operators know, such as the vehicle's own flight mode. Decision 1 adds "MAVLink-only for now is fine", and the Consequences say no second "telemetry or command protocol" is planned. That wording was narrowed during review of [PR #44](https://github.com/kevinjohannesson/gcscode/pull/44), after its red-team review raised the video feed.
- **WHEP carries no vehicle vocabulary.** It is how a browser receives a live stream, and what it yields is a browser `MediaStream`. Nothing in `extension-video` knows MAVLink, system IDs or any vehicle fact, and [the stream path is never built from a system ID](#the-stream-path-is-never-built-from-a-system-id).
- **The tree already reads it this way.** `extension-map`, a generic feature, speaks MapLibre's style and tile protocol over HTTP (`packages/extension-map/src/map-view.svelte`), and nobody has asked it to publish a tile-source contract.
- **VS Code draws the same line.** Its core knows no programming language, but it does know file systems, URIs and image formats.

The reading covers more than video: it is also why the map may fetch tiles. It lives in this spec's decision rather than in a new ADR. _(Owner, on the ADR-0014 author's advice: a separate ADR is worth writing only if this reading should bind every feature.)_ _Trigger to promote it to an ADR:_ the next generic feature that relies on it, or the first dispute over whether something is a transport or a vehicle protocol. Because ADR-0014 cannot carry a breadcrumb, the trigger is propagated to `docs/out-of-scope.md` (row 8 below), where the next feature can find it.

**The trigger for publishing a video-source contract** is separate, and is about sources, not the ADR: a second way of getting video (another transport, or a camera announcing its own stream), or a second vehicle whose video an operator needs, which makes choosing a camera an operator task and ties streams to vehicles. `extension-video` then publishes the contract per [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s mechanics and [ADR-0014](../decisions/ADR-0014-protocols-as-languages.md) Decision 2, and the WHEP module moves out to become the first provider.

The package is named for the feature (`extension-video`), not the transport (`extension-whep-video`), because that name survives the move. _(My call.)_

### Decision: a domain extension with no exports (ADR-0012)

Video is a domain concern, so it is an extension. v0 publishes no service API because nothing consumes one. When the contract trigger above fires, the contract goes into this package's exports, types from its entry point and the live API through `activate()`'s return value, per [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md).

### The settings-editor trigger fires, and is declined

The [`docs/out-of-scope.md`](../out-of-scope.md) row for the settings editor names "a second real setting consumer landing" as one of its triggers. `gcscode.video.whepUrl` is the second, after `gcscode.sitl.connectionUrl`. The trigger fires and is declined, for as long as video is single-vehicle: both settings are then addresses fixed by how the system is installed, not something an operator changes while flying. With two vehicles, choosing whose camera to watch would mean a devtools edit and a reload, which is an operator task; but a second vehicle needing video fires the video-source contract's trigger, and the vehicle-linkage end state (Non-goals) makes the choice a contract question rather than a setting. So the propagation below sharpens the settings-editor trigger to "the first setting an operator is expected to change in normal use", and says that choosing a vehicle's camera is not one: it fires the video-source contract row instead. _(My call.)_

## Validation

### Automated

Vitest, co-located tests, in the `node` environment like the other extension packages, with fakes for `fetch` and `RTCPeerConnection` (including `getStats()`). Every expected value below comes from this spec.

1. **Activation.** `activate()` registers the view `gcscode.video.main` titled `Video` and the setting `gcscode.video.whepUrl` with default `http://localhost:8889/drone-1/whep`, pushes every disposable to `context.subscriptions`, puts the setting's value in the module state the panel reads, and returns `undefined`. A second activation overwrites that state.
2. **WHEP offer and answer.** The session POSTs to the given URL with `Content-Type: application/sdp` and the offer's SDP as the body, applies the answer from the response, and reports the stream. It reports "picture" once `framesDecoded` first exceeds zero, and only once.
3. **WHEP failures.** A rejected `fetch` reports "unreachable"; a 404 reports "no-stream"; any other non-2xx status reports "refused" with the status as detail; a missing or throwing `RTCPeerConnection` reports "unsupported". After the stream arrived, `connectionState` `failed` or the track ending reports "dropped" at once; `disconnected` reports it only after 5000 ms, and not at all if the state recovers sooner (fake timers). The panel's own `close()` reports nothing.
4. **WHEP close.** `close()` sends `DELETE` to the `Location` URL resolved against the WHEP URL, closes the peer connection, and is a no-op the second time. Closing before the answer arrives leaves no peer connection open, and the late answer is ignored. With fake timers: after `close()`, `getStats()` is never called again, and a `disconnected` state that began before `close()` reports nothing when its 5000 ms run out. After the picture report, `getStats()` is not called again either.
5. **Panel state** (fake timers throughout). Connecting until the picture report, then playing. No picture report 15000 ms after the attempt began: "no picture in time". A drop before the picture report is also "no picture in time"; a drop after it is "lost". After any failure but "unsupported", a new attempt after exactly 3000 ms; after "unsupported", none. Unmounting closes the session, and no timer fires afterwards.
6. **Bundling.** `bundled-extensions.test.ts` asserts that `gcscode.video` comes before `gcscode.map`, so Map is the front tab at load.

Each test is seen failing before it passes, per `CLAUDE.md`.

### Live, recorded in the feat PR

- **The demo.** SITL at `--streamrate 25`, camera-sim running in a visible window, MediaMTX started by hand, `fly_circle.py` flying. The drone moves on Map, and its video plays in Video, with the two panels side by side. The time from load to the first picture goes in the PR.
- **Late camera.** gcscode is started before camera-sim. The panel says there is no video yet, and plays within about 10 seconds of camera-sim publishing (one retry interval plus the time to a first picture).
- **Server restart.** Stopping MediaMTX mid-flight makes the panel say "Video lost" within about 10 seconds; restarting MediaMTX brings the picture back without a reload. The measured time to "Video lost" goes in the PR.
- **Map in front at load.** Every load opens on Map, with Video's tab beside it.
- **A session that starts hidden.** At load, behind Map, Video connects without cycling through "no picture in time", and shows the picture the first time it is switched to. Restarting MediaMTX while Map is in front does the same.
- **Tab switching.** With Map and Video as tabs in one group, switching to Video and back resumes the picture each time.
- **Clean hang-up.** Disabling the extension from the extensions panel removes the Video panel and ends the session; MediaMTX's log shows the reader closing. Re-enabling it brings the panel back and playing.

## VS Code alignment

| Concern                                                      | VS Code                                                                                                                     | gcscode                                                                                                                                  | Status                                                                                                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Showing media in a panel                                     | No native video surface; an extension renders `<video>` inside a webview view                                               | A Svelte component in a dock panel through `host.window.registerView`, in the app's own page                                             | Divergence, existing: the ledger's "View / status-bar contributions" row ([ADR-0005](../decisions/ADR-0005-extension-boundaries.md)). A further use, not new |
| An endpoint as a setting                                     | `contributes.configuration`, read with `getConfiguration().get`; extensions commonly re-read on `onDidChangeConfiguration`  | `registerConfiguration`, read once in `activate()`; a change applies on the next load                                                    | Existing rows (configuration v1) for the mechanism; reading once is decided here, trigger: the first runtime writer of the setting                           |
| A generic feature speaks a transport, not a vehicle protocol | The core knows no programming language, but knows file systems, URIs and image formats                                      | `extension-video` speaks WHEP, as `extension-map` speaks MapLibre's tile protocol; neither knows a vehicle protocol                      | Alignment, decided here                                                                                                                                      |
| A feature publishes a contract that providers fill           | The ledger's "A feature-owned contract that each protocol fills in" row (the Test Explorer UI extension's Test Adapter API) | Video's contract is deferred until a second way of getting video, or a stream tied to a vehicle                                          | Deferred                                                                                                                                                     |
| What happens to a hidden panel's contents                    | A webview view's contents are destroyed when hidden, unless the extension sets `retainContextWhenHidden`                    | The dock keeps the component mounted and only takes it out of the page; Video keeps its session open and calls `play()` when shown again | Divergence: the mounting behaviour is dockview's; keeping the session open is decided here                                                                   |
| Telling a view it is visible                                 | `WebviewView.visible` and `onDidChangeVisibility`                                                                           | No visibility signal on `ViewContribution`; Video watches its own element with an `IntersectionObserver`                                 | Deferred                                                                                                                                                     |

## `docs/out-of-scope.md` propagation

These land when the iteration ships, in the feat PR, after master is merged into it (a PR branch with reviews is never rebased, since that needs a force push).

1. **Add: Video-source contract.** "Video feed publishes no video-source contract; its panel speaks WHEP itself, in one module, and receives transport-neutral reports. _Trigger to revisit:_ a second way of getting video (another transport, or a camera announcing its own stream), or a second vehicle whose video an operator needs. Then `extension-video` publishes the contract and the WHEP module becomes its first provider." Cites this spec and the ledger's feature-owned-contract row.
2. **Amend: One vehicle seen through two sources** (no new row beside it). Add: "Video feed v0 does not fire this row: it plays an address and attaches its stream to no vehicle. Its vehicle linkage, when it comes, is `extension-video`'s own contract asked per asset key and answered only by that key's source, the MAVLink extension for a MAVLink vehicle (for example from a camera announcing its stream), which adds no second source; a `mavlink`-named add-on reading the MAVLink exports is the stopgap (ADR-0014 Decision 3). The row fires if a stream attaches itself to a listed vehicle through a source of its own." Cites this spec.
3. **Add: Detecting a frozen picture.** "A connected stream whose frames stop looks live; v0 relies on the camera burning its own clock into the frame. _Trigger to revisit:_ the first video source with no burned-in clock (any real camera), or an operator misled by a frozen frame." Cites this spec.
4. **Amend: Settings editor UI.** Replace the trigger "a second real setting consumer landing" with "the first setting an operator is expected to change in normal use (choosing a vehicle's camera is not one: it fires the Video-source contract row)", and note that the second consumer (`gcscode.video.whepUrl`, an installation address) fired the old wording and was declined here. The ledger's "Settings editor UI" row gets the same trigger (see below).
5. **Add: Telling a view it is visible.** "`ViewContribution` carries no visibility signal; a view that needs one watches its own element. _Trigger to revisit:_ the first remote video source, where a hidden panel ought to release its stream, or a change in how the shell's dock hides tabs (another renderer, layout persistence, the webview wing), which would break element-based detection." Cites this spec.
6. **Add: Extension views can reach the dock.** "dockview-svelte mounts every panel with its context, so `getDockviewContext()` in an extension's view returns the panel API and `containerApi`, the shell's whole layout API, and the extension import rules do not cover `dockview-*`. Convention alone keeps extensions out of it. _Trigger to revisit:_ the next change to the extension import rules, the first extension importing `dockview-*`, or the untrusted-extension iteration." Cites this spec.
7. **Add: View mount and render are uncontained.** "A throw while the shell mounts a view escapes the panel-sync effect in `app.svelte`: later panels never appear, the effect stops re-running, and no activation failure is recorded. A throw from a view's own effects or `onMount` escapes a later effect flush, equally unrecorded; Map and Map demo construct `maplibregl.Map` in `onMount` uncaught, and MapLibre throws without a WebGL context. Activation-failure containment reaches neither. _Trigger to revisit:_ the first view seen throwing at mount or in an effect, or the webview wing." Cites this spec, whose panel avoids throwing by construction.
8. **Add: The transport reading of ADR-0014 lives in a spec.** "ADR-0014 Decision 1 is read as keeping _vehicle_ protocols out of generic features, so `extension-video` may speak WHEP and `extension-map` may fetch tiles; the reading is stated in the video feed spec, not in an ADR. _Trigger to revisit:_ the next generic feature that relies on it, or the first dispute over whether something is a transport or a vehicle protocol; then the reading moves to an ADR." Cites this spec. It sits beside the ADR-0014 rows, since ADR-0014 itself cannot carry a breadcrumb.

## `docs/roadmap.md` propagation

- **Video feed:** tick it with a shipped note saying what v0 contains (one panel, one stream from a configured WHEP address, retrying with an explanation) and what it does not (the contract, vehicle linkage, frozen-picture detection, each with its `out-of-scope.md` row). Drop "Likely a Phase C streaming-source consumer alongside SITL", which v0 does not bear out.
- **MediaMTX in the repo:** its trigger "Video feed v0" fired and was declined, so the trigger becomes "a second machine needing the same media setup, or the first video iteration that needs MediaMTX configured beyond its defaults".

## `docs/vs-code-alignment.md` propagation

- **Alignments:** add "A generic feature speaks a transport, not a vehicle protocol" from the table above. Amend the existing "A feature-owned contract that each protocol fills in" row's gcscode column to say video's contract is deferred, pointing at the Deferrals row below, rather than adding a second row for the same principle.
- **Divergences** (each with its trigger): "What happens to a hidden panel's contents", trigger: the first remote video source, where holding a hidden panel's stream costs something. "An endpoint as a setting, read once", trigger: the first runtime writer of the setting.
- **Deferrals:** "Telling a view it is visible", with out-of-scope row 5's trigger. "Video's video-source contract", with out-of-scope row 1's trigger.
- **Amend** the Deferrals table's "Settings editor UI" trigger to match out-of-scope item 4.

## Known unknowns

**Measured on 2026-11-09**, by a throwaway probe page in the desktop app's built-in browser (Chromium): it published an animated canvas to the running MediaMTX over WHIP, H.264, and read it back over WHEP from a page on another origin.

- MediaMTX exposes `Location` to the cross-origin page (`/probe/whep/<id>`), and `DELETE` on it returns 200.
- A `<video>` that was put in the page, then taken out before its stream was set (Video's state behind another tab) still fires `playing` and decodes frames off-page.
- A playing `<video>` taken out of the page pauses; the connection stays `connected` and `framesDecoded` keeps rising. Put back, it stays paused until `play()`, after which it plays.
- `framesDecoded` from `getStats()` advances off-page and while the element is paused, so it works as the first-picture signal.
- The first reader of a freshly published stream waited 6.2 seconds for its first picture; later readers about 1.2 seconds.
- The extension architect's fix check on PR #45 measured, in headless Chromium 156, that an `IntersectionObserver` on an element reports it coming back into view across dockview's detach and reattach, which is what the resume-on-show relies on.
- Both reviewers' fix checks measured, in headless Chromium, that Map built out of the page still takes its real size when first shown (MapLibre 5.24.0 skips the detached container's 0×0 resize report and resizes on reattach). With Map in front at load (owner) Map is never built out of the page at load, so this matters only if the landing tab changes.

**Still unknown:**

- **The same behaviour in the browser the owner runs gcscode in.** Every measurement above ran in Chromium (the desktop app's, or headless); Chrome should match, and Safari and Firefox are unverified, the `IntersectionObserver` resume included.
- **Time to first picture and to "Video lost" against camera-sim**, whose encoder is the browser's. The live demo measures both, against the 15-second connect timeout and the 10-second expectation.
- **Whether gcscode's own browser tab being hidden matters.** Browsers throttle hidden pages. Receiving and decoding should carry on, but this is unverified; camera-sim's freezing is on the encoding side.
- **Latency is not measured.** camera-sim's burned-in UTC time can be read against a clock during the demo. No target is set.
- **H.264 decoding.** camera-sim's encoder sends H.264, and the browser running gcscode must decode it. Chrome and Safari do; other browsers are unverified. A browser that cannot would most likely fail at the offer (MediaMTX refusing an offer with no codec in common), which the panel shows as "refused".

## Post-merge implementation

Code, so a `feat/video-feed` branch through the subagent-driven pipeline, reviewed per the `review-loop` skill. The plan lists the Known unknowns above as checklist items. camera-sim is not edited; if the feature needs anything from it, the controller session is told. ADR-0014's follow-up PRs rename `extension-sitl` and `extension-flight-overlay`, so a trivial conflict in `bundled-extensions.ts` is expected, and the feat branch starts from master after the rename lands. The repo-state claims here (the shell's view host passes no props, dockview's default renderer, `getDockviewContext()` reaching extension views, the panel-sync effect in `app.svelte`, `gcscode.sitl.connectionUrl` as the only other setting) were checked while writing; the implementer re-checks rather than trusting them.

## Origin

Brainstormed with the owner on 2026-11-09, in a desktop session started by the controller session that coordinates the video feed and manual control extensions. Round 1 of review on [PR #45](https://github.com/kevinjohannesson/gcscode/pull/45) (red-team and the extension architect) and three edits the owner asked for on the ADR-0014 author's advice reshaped it: the ADR-0014 reading, the stream-path rule and the vehicle-linkage end state. In round 2 the owner chose Map as the tab every load opens on.
