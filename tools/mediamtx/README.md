# mediamtx

[MediaMTX](https://github.com/bluenviron/mediamtx), the media server between a camera and gcscode: camera-sim publishes each vehicle's view to it over WebRTC (WHIP), and gcscode's Video panel plays it back (WHEP). It is a tool, not part of the GCS. This folder holds a pinned release and its config. MediaMTX is MIT-licensed.

## Setup (macOS)

From the repo root:

```sh
pnpm --filter mediamtx run setup
```

or `./setup.sh` from this folder. It downloads MediaMTX v1.21.3 for this Mac's processor (Intel or Apple Silicon, about 30 MB), checks the archive against the sha256 committed in `setup.sh`, and installs only the binary. It is safe to re-run: it skips the download when the pinned version is already installed.

## Running it

```sh
pnpm --filter mediamtx start
```

or `./run.sh` from this folder. It runs the installed binary with this folder's `mediamtx.yml`, and Ctrl-C stops it. `pnpm dev:sitl` at the repo root runs it with SITL and the dev server. If setup hasn't run, it says so and names the command.

The config keeps MediaMTX's defaults and turns off the servers nothing uses (RTMP, HLS, SRT and MoQ). What stays on:

| Port           | Serves                                                                       |
| -------------- | ---------------------------------------------------------------------------- |
| TCP 8889       | WebRTC: publish to `http://localhost:8889/<path>/whip`, read from `.../whep` |
| UDP 8189       | WebRTC's media (ICE)                                                         |
| TCP 8554       | RTSP, for players such as VLC: `vlc rtsp://localhost:8554/drone-1`           |
| UDP 8000, 8001 | RTSP over UDP (RTP and RTCP)                                                 |

camera-sim publishes vehicle N's view as `drone-N`, and the Video panel reads `http://localhost:8889/drone-1/whep` by default. Any path can be published or read, by anyone who can reach this machine: it listens on all interfaces, with no passwords. That suits simulated streams on a home network; don't run it as is on an untrusted one.

To run a second MediaMTX beside one already on these ports, move it with MediaMTX's environment overrides:

```sh
MTX_RTSPADDRESS=:18554 MTX_RTPADDRESS=:18000 MTX_RTCPADDRESS=:18001 \
  MTX_WEBRTCADDRESS=:18889 MTX_WEBRTCLOCALUDPADDRESS=:18189 \
  pnpm --filter mediamtx start
```

## Where things live

The repo holds only the scripts and the config. The binary lives outside it, in `GCSCODE_MEDIAMTX_HOME` (an absolute path, default `~/.gcscode/mediamtx`), so every worktree shares one copy. That folder holds nothing else: with this config MediaMTX writes no files, and it logs to the terminal.
