# WLEDGame

A 1D arcade game played on a WLED-driven LED strip, controlled from your phone.

Enemies of three colors creep along the strip toward a flickering "fire" at one end. Hit them with the matching color before they reach it. Two game modes, an optional kids mode, an in-game brightness slider, and a configurable background flavor color. Designed to drive any [WLED](https://kno.wled.ge/)-flashed strip on your LAN over UDP DRGB/DNRGB at 30 fps.

## How to play

- Three big buttons on your phone: **Red**, **Green**, **Blue**.
- Three colored "enemies" creep down the LED strip from one end toward the fire zone (the last few LEDs, animated with flickering flames).
- Tap the matching color to destroy the enemy nearest the fire. If anything reaches the fire, the round is over.
- Difficulty ramps continuously — enemies spawn faster and move faster as your score climbs.

### Modes

| Mode | What a wrong-color shot does |
|---|---|
| **Consumed** | Disappears on contact. Cluster intact. Simpler. |
| **Stuck at front** | Sticks to the **fire-side** of the enemy and becomes the **new head**. The cluster is now one LED closer to fire, AND your next correct color is whatever you just mis-shot. Make several mistakes in a row and you'll cluster yourself into game over. |

### Kids mode

Enables a single toggle that halves enemy speed, lengthens spawn intervals, and disables the difficulty ramp.

### Background flavor

Pick a low-brightness solid color or "breathe" pulse. Off by default.

## Hardware requirements

- A WLED-flashed LED strip (≥30 LEDs recommended).
  - Tested with strips up to ~240 LEDs. Strips above 489 LEDs use DNRGB chunking automatically.
- A small Linux box on the same LAN — Raspberry Pi, NUC, Proxmox LXC, anything that runs Node 20.
- Phones / tablets / PCs to connect from.

## Quick start (development)

```bash
git clone https://github.com/<owner>/WLEDGame.git
cd WLEDGame
npm install
cp wleds.example.json wleds.json
$EDITOR wleds.json   # put your WLED IPs in here
npm test             # all tests should pass
node server.js
# open http://localhost:8080/
```

## Production install (systemd)

This installs as a system service running under a dedicated user.

```bash
sudo make deploy           # copies to /opt/wledgame, creates wledgame user, npm ci
sudo make install-service  # systemctl enable; service NOT started yet
sudo systemctl start wledgame
make status
```

Default URL: `http://<your-server-ip>:8080/`. Point a phone at it.

### Reverse proxy

If you want a real hostname or HTTPS, put it behind a reverse proxy (e.g., nginx, Caddy, nginxproxymanager). The only non-default requirement is **WebSockets must be enabled** for the `/ws` endpoint.

Example nginx snippet:

```nginx
location /ws {
  proxy_pass http://localhost:8080/ws;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}

location / {
  proxy_pass http://localhost:8080/;
}
```

## Configuration

### `config.json`

Game tunables: spawn interval base, enemy speed curve, fire zone size, render constants. Full list in `docs/superpowers/specs/2026-04-30-wledgame-design.md` §5.6 and §5.8.

### `wleds.json` (gitignored, you create)

```json
{
  "wleds": [
    { "host": "10.0.0.10" },
    { "host": "10.0.0.11", "name": "Hallway" }
  ]
}
```

Required: `host`. Optional: `name` (otherwise pulled from WLED's own `/json/info`), `id` (otherwise derived from the last octet), `udpPort`, `httpPort`.

## Architecture

- **Server**: single Node.js process. HTTP + WebSocket on the same port (default 8080), UDP DRGB/DNRGB to whichever WLED you picked.
- **Virtual line**: game world is 0–1000 units, mapped to physical LEDs at render time with subpixel interpolation. Same gameplay feel on any strip length.
- **State save/restore**: when a round starts, the WLED's current `/json/state` is snapshotted. On game over / shutdown / next-boot crash recovery, it's POSTed back. The realtime UDP protocol's 1-second timeout is the safety net if the explicit restore fails.
- **Multi-WLED**: pick a fixture from a dropdown on the start screen. Server probes each at boot and on selection.

Full design: [`docs/superpowers/specs/2026-04-30-wledgame-design.md`](docs/superpowers/specs/2026-04-30-wledgame-design.md).
Roadmap (v0.2): [`docs/superpowers/backlog/v0.2-features.md`](docs/superpowers/backlog/v0.2-features.md). Includes 10-level + 3-boss progression, multi-color "W" enemies, occlusion tunnels.

## Development

```bash
npm test            # all unit + smoke tests
node server.js      # foreground, fast iteration
make logs           # tail systemd logs (when deployed)
```

The codebase is small and modular — each `src/*.js` file owns one responsibility. Tests use Node 20's built-in `node:test`. No bundler.

## Contributing

Issues and PRs welcome. If you've got an idea, open an issue first to talk through scope.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

This game stands on the shoulders of three excellent projects. Their ideas shaped this design directly — please go check them out and star them.

### [WLED](https://kno.wled.ge/) — the firmware

By [Aircoookie](https://github.com/Aircoookie) and a large community of contributors. WLEDGame is just a thin Node.js process that streams realtime UDP frames to a real WLED instance. Every effect, every preset, every "save state and come back to it later" capability lives in WLED — we save and restore via its `/json/state` endpoint and stream pixels via its DRGB/DNRGB realtime protocols. None of this is possible without WLED.

### [TWANG / TWANG32](https://github.com/bdring/TWANG32) — the virtual line idea

Originally [Critters/TWANG](https://github.com/Critters/TWANG) (Arduino-based 1D dungeon crawler), and the ESP32 port [bdring/TWANG32](https://github.com/bdring/TWANG32). We borrow their **virtual 1000-unit line architecture** wholesale: gameplay logic operates on a fixed 0–1000 coordinate space, and a `getLED()`-style mapping converts to physical LED indices at render time. Their insight that decoupling game logic from physical strip length is what lets us serve 60-LED, 144-LED, and 489+-LED fixtures from one renderer with zero rebalancing — no per-strip tuning. We added subpixel anti-aliasing on top, but the abstraction is theirs.

### [1D-RGB-Invader](https://github.com/worksasdesigned/1D-RGB-Invader) — the genre and progression

By [worksasdesigned](https://github.com/worksasdesigned). A polished ESP32-based Space Invaders for a 240-LED strip with **10 levels, 3 bosses (Masterblaster, The Tank, RGB Overlord), kids mode, bonus stages, and a settings page for live tuning**. Their balancing across all 10 levels is hand-tuned and worth studying. WLEDGame v0.1 ships endless mode only, but the v0.2 backlog explicitly plans to follow their level-and-boss structure — see [`docs/superpowers/backlog/v0.2-features.md`](docs/superpowers/backlog/v0.2-features.md) item A. The "kids mode toggle" pattern in v0.1 is also lifted directly from their game.

### Differences from those projects

WLEDGame's distinct contributions:
- Driver model — runs as a network service driving an existing WLED, not embedded firmware on a dedicated controller.
- Phone-as-controller via WebSocket, with co-op (multiple phones, same fixture).
- Multi-WLED selector with per-fixture state save/restore and crash recovery.
- "Stuck-at-front" wrong-color mode (mistakes attach as the new head and pull demise closer).
- Subpixel-anti-aliased rendering on top of the TWANG-style virtual line.
