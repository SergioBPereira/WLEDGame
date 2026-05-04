# WLEDGame

A 1D arcade game played on a WLED-driven LED strip, controlled from your phone. Pick a wrong-color mode and a difficulty, hit start, and shoot the creeping enemies before they reach the fire.

A single Node.js service drives any [WLED](https://kno.wled.ge/)-flashed strip on your LAN over UDP DRGB/DNRGB at 30 fps and serves the controller UI over HTTP+WebSocket on the same port.

## What's in the box

**Gameplay** — three colored "enemies" creep down the strip toward a flickering fire zone. Tap **Red / Green / Blue** on your phone to destroy the one nearest the fire. Anything that reaches the fire ends the round.

**Campaign mode** — 10 hand-tuned levels followed by 3 bosses (after L4, L7, L10), then an open-ended endless coda. Each level has a fixed enemy budget, spawn cadence, and speed; difficulty climbs across the whole campaign and resets on game over.

**Bosses**

| Boss | Mechanic |
|---|---|
| **Masterblaster** | HP 6. Color cycles R → G → B every 1.5 s — only the active color hurts it. |
| **The Tank** | HP 12. Slow, takes any color, immune to wrong-color "stuck" mode. |
| **RGB Overlord** | HP 20. Fast color cycle. Periodically spawns regular minions. |

Defeating a boss awards a bonus equal to its max HP on top of per-hit score. A persistent banner under the HUD shows the boss name for the duration of the fight, with an HP bar.

**Endless mode** — pick from the start screen at any time. Uses the v0.1 score-based difficulty ramp instead of the campaign's hand-tuned curve.

**Wrong-color mode**

| Mode | What a wrong-color shot does |
|---|---|
| **Consumed** | Disappears on contact. Cluster intact. Simpler. |
| **Stuck at front** | Sticks to the **fire-side** of the enemy and becomes the **new head**. The cluster is now one LED closer to fire, AND your next correct color is whatever you just mis-shot. Bosses are immune to this rule. |

**W enemies** (optional) — multi-color enemies that need one hit of *each* of the three colors to die. Render as white when fully fortified, then cyan/magenta/yellow as you knock channels off.

**Kids mode** — a single toggle that halves enemy speed, lengthens spawn intervals, and disables the difficulty ramp.

**Tunnels** (optional) — at round start, a brown band is placed somewhere past the first third of the strip. Enemies passing through it disappear visually but still tick and collide — a "blind spot" you must time. Tunnel size starts at 5 % of the strip on level 1 and grows by 1 LED per level toward the fire, capped at 15 %.

**Visual feedback**

- **Strip preview**: opt in on the start screen to see the live frames mirrored as a canvas in the browser, useful when the strip isn't in your line of sight.
- **Danger pixel**: a warm amber-red pulsing pixel shows the deepest position any enemy reached in the current round.
- **Level transition**: between levels the strip freezes for ~1.5 s and pulses in a kind-coded color (cyan = normal level, amber = boss intro, magenta = endless), with a localized name flash on the page.
- **Background flavor**: low-brightness solid color or "breathe" pulse on the strip behind the entities. Off by default.
- **Lead-enemy emphasis**: the closest enemy to the fire pulses faster as it approaches, giving you a visceral "shoot this one" cue.

**High scores** — best score per (WLED, mode, kids, W-enemies, campaign/endless) setup combo, persisted to disk. The start screen shows a chip with the current setup's record and how long ago it was set.

**Internationalization** — UI is fully translatable. EN, PT, FR ship; locale files live in `public/locales/*.json`. Switch language via the pill in the top-right corner; the choice is remembered. Server default lang comes from `config.json`; otherwise the picker falls back to `navigator.language` then `en`.

**WLED resilience** — server probes each WLED at boot. If any are offline at boot, the next page hit (or WS connect) triggers a quick re-probe of just the offline ones — debounced so a refresh storm doesn't hammer them. The page updates the moment any come back online.

## Hardware requirements

- A WLED-flashed LED strip (≥30 LEDs recommended).
  - Tested with strips up to ~645 LEDs. Strips above 489 LEDs use DNRGB chunking automatically.
- A small Linux box on the same LAN — Raspberry Pi, NUC, Proxmox LXC, anything that runs Node 20+.
- Phones / tablets / PCs to connect from. Modern browser; touch and mouse both work.

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

Game tunables: spawn interval base, enemy speed curve, fire zone size, render constants, default UI language. Full list in `docs/superpowers/specs/2026-04-30-wledgame-design.md` §5.6 and §5.8.

Notable keys added in v0.2:

| Key | Default | Purpose |
|---|---|---|
| `defaultLang` | `"en"` | First-time visitors get this language unless their browser overrides. |

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

> Note: tunnels are a **gameplay option** the player toggles on the start screen; they are not configured in `wleds.json`.

### Persisted state

Lives under `<stateDir>` (default `/var/lib/wledgame`):

- `last-state-<id>.json` — WLED state snapshot taken at round start, restored on game over / shutdown / crash recovery.
- `highscores.json` — top score per `(wledId, wrongColorMode, kidsMode, wEnemies, endless)` tuple.

## Architecture

- **Server**: single Node.js process. HTTP + WebSocket on the same port (default 8080), UDP DRGB/DNRGB to whichever WLED you picked.
- **Virtual line**: game world is 0–1000 units, mapped to physical LEDs at render time with subpixel interpolation. Same gameplay feel on any strip length.
- **Level system**: `src/levels.js` defines the campaign (10 normal + 3 boss + endless) behind a small `LevelManager` interface. The runner drives spawning + speed via the active level rather than score-only formulas.
- **State save/restore**: when a round starts, the WLED's current `/json/state` is snapshotted. On game over / shutdown / next-boot crash recovery, it's POSTed back. The realtime UDP protocol's 1-second timeout is the safety net if the explicit restore fails.
- **Multi-WLED**: pick a fixture from a dropdown on the start screen. Server probes each at boot and re-probes any offline ones on the next client hit.
- **i18n**: locale JSON files in `public/locales/`, fetched at startup; `data-t` attributes apply translations to static elements; a tiny `t()` handles dynamic strings.

Full design: [`docs/superpowers/specs/2026-04-30-wledgame-design.md`](docs/superpowers/specs/2026-04-30-wledgame-design.md).
v0.2 backlog (status of each item): [`docs/superpowers/backlog/v0.2-features.md`](docs/superpowers/backlog/v0.2-features.md).

## Development

```bash
npm test            # all unit + smoke tests (104+)
node server.js      # foreground, fast iteration
make logs           # tail systemd logs (when deployed)
```

The codebase is small and modular — each `src/*.js` file owns one responsibility. Tests use Node 20's built-in `node:test`. No bundler.

### Adding a language

1. Drop `public/locales/<code>.json` next to the existing ones — same key set as `en.json`.
2. Add `<code>` to `SUPPORTED_LANGS` in `server.js`.

The picker, `t()` helper, and fallback chain (server → browser → en) pick it up automatically.

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

By [worksasdesigned](https://github.com/worksasdesigned). A polished ESP32-based Space Invaders for a 240-LED strip with **10 levels, 3 bosses (Masterblaster, The Tank, RGB Overlord), kids mode, bonus stages, and a settings page for live tuning**. WLEDGame v0.2 follows their 10-level + 3-boss structure (and reuses the boss names — see [`src/levels.js`](src/levels.js) `LEVEL_DEFS`). Their balancing across the campaign is hand-tuned and worth studying. The kids-mode toggle pattern is also lifted directly from their game.

### Differences from those projects

WLEDGame's distinct contributions:
- Driver model — runs as a network service driving an existing WLED, not embedded firmware on a dedicated controller.
- Phone-as-controller via WebSocket, with co-op (multiple phones, same fixture).
- Multi-WLED selector with per-fixture state save/restore and crash recovery.
- "Stuck-at-front" wrong-color mode (mistakes attach as the new head and pull demise closer).
- "W" multi-color enemies (need a hit of each channel to die).
- Tunnel zones as a gameplay option that grow per level.
- Subpixel-anti-aliased rendering on top of the TWANG-style virtual line.
- Per-setup high scores with a "BEST" chip on the start screen.
- Fully localized UI (EN / PT / FR).
