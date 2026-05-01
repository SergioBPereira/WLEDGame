# WLED Game — v0.1 design

Date: 2026-04-30
Status: Approved by user, pending review of this spec.

## 1. Goal

A Node.js service that drives a WLED LED strip as a 1D arcade game. Players connect from a phone or PC browser, pick a fixture from a dropdown, choose a wrong-color mode and difficulty (kids/normal), then play. The service serves the page, runs the game loop, and streams 30 fps DRGB/DNRGB UDP frames to the chosen WLED. Game over restores the WLED to whatever effect was running before.

## 2. Non-goals (v0.1)

- Levels, bosses, bonus stages — see `docs/superpowers/backlog/v0.2-features.md`.
- High-score persistence across restarts.
- Sound (the strip is the feedback channel).
- Authentication (the service trusts everyone on the LAN).

## 3. High-level architecture

```
[browser] --HTTP/WS--> [wledgame service @ CT IP:8080] --UDP DRGB/DNRGB--> [WLED]
                                       \--HTTP /json/state--> [WLED]   (save & restore only)
```

- Single Node.js process (ESM).
- HTTP + WebSocket on the same port (default 8080) — `ws` library.
- UDP via `dgram`. No third-party WLED library — `wled-client` does not handle UDP realtime, which is our hot path.
- All clients connected to the same service share the same game state. Multiple browsers on the same fixture = co-op.

## 4. Virtual unit line

The game world is **0–1000 virtual units**, regardless of physical LED count. Inspired by TWANG/TWANG32.

- Spawn position: 0 (far from fire).
- Fire zone: `[1000 - fireZoneVirtualSize, 1000]` where `fireZoneVirtualSize = 1000 * fireZoneLeds / ledCount`.
- Speeds in units per second.
- Render maps virtual → physical LED with **subpixel anti-aliasing**: a virtual position of `v` lights LED `floor(v * ledCount / 1000)` and the next LED, weighted by the fractional remainder.
- Single tuning set works for 60-, 144-, 240-, 489+-LED strips. No per-fixture rebalancing.

## 5. Game design

### 5.1 State machine

- `idle` — server idle, no enemies, strip in fire-zone-only render. Accepts `{type:"start"}`.
- `playing` — game loop active.
- `over` — game-over screen, 5-second lockout. Server ignores `start` for 5s, then auto-transitions to `idle`. Client receives `{type:"error", reason:"cooldown", retryInMs}` if it tries early.

### 5.2 Entities

- **Enemy**: `{id, pos: 0..1000, color: 'R'|'G'|'B', cluster: ClusterId}`. Spawned with random color, advances toward 1000. *(v0.2 will extend `color` to a bitmask for multi-color enemies — see backlog item M; v0.1 should keep enemy color access narrow so the migration is mechanical. Item M was subsequently implemented as a per-round opt-in toggle, default off.)*
- **Shot**: `{id, pos: 0..1000, color: 'R'|'G'|'B'}`. Spawned at the fire-zone edge (`pos = 1000 - fireZoneVirtualSize`), travels toward 0.
- **Cluster** (stuck-at-front mode only): an enemy plus zero or more attached wrong-color shots. The cluster has an ordered sequence of colors from leading-edge (fire-facing) to trailing-edge. The leading edge color is the **head**, what the player must match next.

### 5.3 Wrong-color modes (player picks at start)

Mode is selected on the start screen and locked for the round.

**Mode "consumed":**
- Wrong-color shot disappears on first contact with any enemy. No effect on the enemy.
- Right-color shot destroys the enemy. Both vanish, score +1.

**Mode "stuck-at-front":**
- Wrong-color shot **attaches to the fire-facing side of the cluster** it hit. The shot becomes the new head, 1 LED-equivalent (= `1000/ledCount` units) closer to fire than the previous head.
- The cluster moves as a unit at the same speed as a lone enemy.
- Right-color shot (matching the current head) dissolves the head. Cluster shrinks by one; the next color becomes the new head. If the cluster is empty after the dissolve, the cluster is removed. Score +1.
- Worked example (60-LED, `FFFF` is fire zone shown left, spawn end on right):
  - `FFFF---R---B` (fire zone shown left, spawn end right). Shoot G → G launches from the fire-zone edge and travels rightward (toward spawn), contacts R on R's fire-facing (left) side → `FFFF--GR---B` (cluster `GR`, head G; B unchanged).
  - shoot R while head is G → R-shot passes through the cluster? **No.** A shot only interacts with the **head** of the first cluster it meets. R-shot meets head G → mismatch → R becomes new head: `FFFF-RGR---B`.
  - shoot G again → meets head R → mismatch → G becomes new head: `FFFFGRGR---B`. (Plausible game-over situation: the cluster front is now in the fire zone.)

**Shot/cluster interaction rule:** a shot only resolves against the **head** of the first cluster (or lone enemy) it meets traveling from fire toward spawn. Shots never pass through clusters.

### 5.4 Scoring

- +1 per head removed (matches both modes uniformly).
- "Removing a head" includes dissolving a previously-stuck wrong-color shot. The player is rewarded for cleaning up their own debris.

### 5.5 Lives

- 1 life. Any cluster's leading edge entering the fire zone (`pos >= 1000 - fireZoneVirtualSize`) ends the game immediately.

### 5.6 Difficulty ramp (continuous)

All in `config.json` under `game.difficulty`:

```json
{
  "spawnBaseMs": 1800,
  "spawnEvery": 5,
  "spawnStepMs": 60,
  "spawnMinMs": 500,

  "speedBaseUnitsPerSec": 70,
  "speedEvery": 15,
  "speedFactor": 1.05,
  "speedMaxUnitsPerSec": 220,

  "shotSpeedUnitsPerSec": 700
}
```

- `spawnIntervalMs(score) = max(spawnMinMs, spawnBaseMs - floor(score / spawnEvery) * spawnStepMs)`
- `enemySpeed(score) = min(speedMaxUnitsPerSec, speedBaseUnitsPerSec * speedFactor^floor(score / speedEvery))`
- Shot speed is constant — the player's only stable thing.
- Sanity at score 0 with default `LED_COUNT=60`, `fireZoneLeds=4`: an enemy traverses ~933 virtual units (1000 minus the 67-unit fire zone) at 70 units/sec ≈ 13.3 s. Spawn gap 1.8 s.
- At score 300 (~10 steps of speed, ~60 steps of spawn): enemy speed ~114 units/sec → traverse ~8.2 s. Spawn floor 500 ms. Crowded and fast.

### 5.7 Kids mode

Selected on the start screen alongside the wrong-color mode. Locked for the round. Effects:

- Difficulty ramp **disabled** — constants stay at base for the entire round.
- `spawnBaseMs * 1.8`, `speedBaseUnitsPerSec * 0.5`.
- Same scoring, same wrong-color mode picker available.

### 5.8 Visual settings

These don't affect game logic, only render output. Three of them.

**Brightness (in-game).** Per-client, range 10–100%, default 70%. Persisted in browser `localStorage` under `wledgame.brightness`. Sent to server via `{type:"brightness", value: 0..100}`, throttled client-side to ≤10 msg/sec. Applied as the **last step** of the render pipeline (multiply each RGB byte by `value/100`). When multiple clients are connected, the server applies the **most recently received** brightness. The visible-on-strip brightness reflects whichever player most recently moved their slider — by design, since this is co-op and the strip is shared.

**Background (start-screen pick, locked at round start).** Three modes:
- `off` (default) — non-game LEDs render as zero.
- `solid` — fixed color at 15% brightness on all LEDs not occupied by entities or fire zone.
- `breathe` — same as `solid` but multiplied by `0.7 + 0.3*sin(t*0.6)` (slow breathing pulse, ~1 Hz peak).

The `solid`/`breathe` modes carry a color: 8 preset swatches (warm white, deep blue, deep red, amber, teal, magenta, purple, dim white) plus a free hex picker. Background is **excluded from the fire zone** (fire animation owns those LEDs) and is **overwritten by entity render** (not added). The 15% multiplier is a fixed pipeline constant (not user-tunable in v0.1, keeps backgrounds from drowning out enemies); the user brightness slider then applies on top of the entire frame in step 6 of the pipeline.

**Lead-enemy emphasis.** Always on in v0.1. The entity (cluster head or lone enemy) with the highest `pos` is the *lead*. When rendering the lead's LED(s):
```
pulseHz(pos) = 1.5 + 4.5 * (pos / 1000)   // 1.5 Hz at spawn, 6 Hz at fire edge
w(t, pos)    = 0.15 + 0.10 * sin(2*pi * pulseHz(pos) * t)
R' = R + w * (255 - R)                    // white-mix per channel
G' = G + w * (255 - G)
B' = B + w * (255 - B)
```
This boosts perceived brightness even when the base color is already saturated, and adds a tension cue that intensifies near the fire zone.

## 6. Rendering pipeline

A frame is built every `1000/targetFps` ms (33 ms at 30 fps). The pipeline is layered so each step has a clear responsibility:

1. **Allocate** `Uint8Array(ledCount * 3)` zeroed.
2. **Background layer** (LEDs `0..ledCount-fireZoneLeds-1` only) — depending on the picked background mode:
   - `off`: leave at zero.
   - `solid`: write `bgColor * 0.15` (per channel).
   - `breathe`: write `bgColor * 0.15 * (0.7 + 0.3*sin(t*0.6))`.
3. **Fire zone** (LEDs `[ledCount - fireZoneLeds, ledCount)`) — write heat (time-coherent sines):
   ```
   relIdx = i - (ledCount - fireZoneLeds)         // 0 = top of fire zone, fireZoneLeds-1 = end
   heat = clamp01(0.65 + 0.20 * sin(t*1.8 + relIdx*0.7) + 0.10 * sin(t*5.3 + relIdx*1.9))
   heat *= 1.0 - relIdx / (2 * fireZoneLeds)       // cooler at the top edge
   R = floor(255 * heat)
   G = floor(180 * heat * heat)
   B = floor(40 * heat * heat * heat)
   ```
4. **Determine the lead entity** — single pass over all enemies (and cluster heads): pick the one with the highest `pos`.
5. **Entity layer** — for each entity at virtual `pos`, compute base RGB; if this is the lead entity, apply the white-mix from §5.8. Then for the rendered LED(s):
   - `physF = pos * ledCount / 1000`
   - `i0 = floor(physF)`, `frac = physF - i0`, `i1 = min(i0+1, ledCount-1)`
   - **Overwrite** the framebuffer (not additive) at `i0` with `(1 - frac) * color`, at `i1` with `frac * color`. This is what makes background colors not bleed under enemies.
   - Order of entity drawing: trailing cluster bodies first, then heads, then shots. Heads/shots take precedence on shared LEDs.
6. **Brightness scaling** — multiply every byte in the framebuffer by `userBrightness / 100`. Single pass, last step before transmit.
7. **Send to WLED**:
   - If `ledCount <= 489`: one DRGB packet `[0x02, 0x01, ...rgb]`.
   - Else: chunk into DNRGB packets `[0x04, 0x01, indexHi, indexLo, ...rgb]` of up to 489 LEDs each, with a 1 ms gap between chunks (avoid burst-drop on WLED).
8. Header second byte `0x01` = 1 second realtime timeout. WLED resumes its previous effect 1 second after frames stop.

**Note: the render runs only when `phase === 'playing'`.** In `idle`/`over`, no UDP frames are sent — WLED is left to run its own effect (background picker is part of the round, not the lobby).

## 7. WebSocket protocol

Path: `/ws`. JSON messages.

### Client → server

```json
{ "type": "hello" }                       // optional, server replies anyway on connect
{ "type": "start",
  "wledId": "wled-141",
  "wrongColorMode": "consumed" | "stuck",
  "kidsMode": false,
  "background": { "mode": "off"|"solid"|"breathe", "color": "#RRGGBB" } }
{ "type": "shoot", "color": "R" | "G" | "B" }
{ "type": "brightness", "value": 0..100 }     // applied to all subsequent rendered frames
{ "type": "ping" }
```

### Server → client

```json
{ "type": "hello",
  "wleds": [ { "id":"wled-141","name":"Kitchen","host":"...","ledCount":60,"online":true }, ... ] }
{ "type": "state",
  "phase": "idle"|"playing"|"over",
  "score": 12,
  "wledId": "wled-141",
  "wrongColorMode": "stuck",
  "kidsMode": false,
  "background": { "mode": "solid", "color": "#001a33" },
  "brightness": 70 }
{ "type": "hit",   "color": "R", "scoreDelta": 1 }
{ "type": "miss",  "color": "G" }                   // shot exited spawn end without matching
{ "type": "stuck", "color": "G" }                   // wrong-color shot got stuck (stuck mode only)
{ "type": "gameOver", "score": 42, "cooldownMs": 5000 }
{ "type": "error", "reason": "wled_unreachable"|"cooldown"|"bad_message", "details"?: ... }
{ "type": "pong" }
```

`state` is broadcast on every phase transition and every score change. `hit`/`miss`/`stuck` are also broadcast for client-side animation feedback.

## 8. HTTP endpoints

- `GET /` — serves `public/index.html`.
- `GET /healthz` — 200 `OK`.
- `GET /api/state` — debug JSON: `{phase, score, wledId, ledCount, fireZoneLeds, mode, kidsMode}`.
- `GET /api/wleds` — same `wleds` array as the WS hello, for non-WS clients.
- All other static files served from `public/` (basic content-type table for `.html .js .css .png .ico .svg`).

## 9. Multi-WLED handling

### 9.1 Config — `wleds.json`

```json
{
  "wleds": [
    { "host": "10.0.0.10" },
    { "host": "10.0.0.11" },
    { "host": "10.0.0.12" }
  ]
}
```

Optional fields per entry: `id` (default = `"wled-" + last octet of host`), `name` (default = WLED's `/json/info.name`), `udpPort` (default 21324), `httpPort` (default 80).

### 9.2 Probing

- At service boot, send `GET /json/info` to each configured WLED **in parallel**, 1.5 s timeout each. Service does not block on probes — they run async; first WS hello after boot includes whatever has resolved so far. Late-arriving probes update the cached list and fan out an updated `hello` to connected clients.
- Cache: `{ id, name, host, ledCount, udpProtocol: 'drgb'|'dnrgb', online: bool, lastError?: string }`.
- On `start`, the server re-probes the chosen WLED if it was marked offline. Final guard: if probe fails at start, reply `{type:"error", reason:"wled_unreachable"}`.

### 9.3 State save/restore

- Per-WLED, persisted at `/var/lib/wledgame/last-state-<id>.json`.
- **On boot**, before any UDP frame is sent: for each `last-state-<id>.json` that exists from a prior crashed run, POST it back to that WLED's `/json/state` and delete the file. This ensures no fixture is left in realtime mode.
- **On `start`**: GET `/json/state` from the chosen WLED, hold it in memory and write it to disk.
- **On gameOver / SIGINT / SIGTERM**: POST the in-memory state back, delete the disk file. If the POST fails, leave the disk file — the next boot will retry.
- WLED's 1-second realtime timeout is the safety net if the explicit restore fails.

### 9.4 Mid-round behavior

- Once a round starts, the WLED dropdown and mode pickers are locked client-side. Any `start` message during `playing` is ignored.
- After game over, dropdown and pickers unlock. Player can switch fixtures freely between rounds.

## 10. UI screens

Single self-contained `public/index.html` (HTML + CSS + JS, no bundler, no external CDNs).

### 10.1 Start screen

- Title "WLED Game".
- Dropdown: WLED fixture (populated from `hello.wleds`, label = `"<name> (<ledCount> LEDs)"`, disabled options for offline). Default = first online entry, fallback first overall.
- Toggle group: wrong-color mode — "Consumed" / "Stuck at front". Default: Consumed.
- Toggle: kids mode. Default: off.
- Background picker:
  - Three-way toggle: "Off" / "Solid" / "Breathe". Default: Off.
  - When Solid or Breathe is selected, a color row appears: 8 preset swatches (warm white, deep blue, deep red, amber, teal, magenta, purple, dim white) + a native `<input type="color">` for custom hex. Defaults to deep blue.
  - Stored in `localStorage` as `wledgame.background = { mode, color }` so the player's last choice survives reloads.
- Big "COMEÇAR" button. Disabled if no WLED is online.

### 10.2 Game screen

- Score (large, top-left).
- Brightness slider (top-center, thin horizontal bar, 10–100%). Stored in `localStorage` as `wledgame.brightness`. On change → debounced 100 ms → `{type:"brightness", value:N}`.
- Connection indicator (top-right, green=connected, orange=reconnecting).
- Three big buttons (R / G / B) at the bottom, `flex: 1`, height ~30vh, no labels, saturated color, `:active` darkens + scales 0.95. Touch + click both work.
- Tap → `{type:"shoot", color:...}`. No client-side rate limit; multiple shots can be in flight.
- On `hit`: vibrate 30 ms (`navigator.vibrate?.(30)`), brief flash on the matching button.
- On `stuck` (stuck mode): different haptic pattern (short-short, 20 ms ×2), red border flash on the matching button to signal "wrong color, that one's stuck on the cluster now."
- On `miss`: subtle dim flash, no vibration.

### 10.3 Game-over screen

- "GAME OVER" + final score.
- "Jogar outra vez" button → returns to start screen. If pressed during 5 s server cooldown, button shows a countdown until enabled.

### 10.4 Connection handling

- WS to `(location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/ws'`.
- Reconnect with exponential backoff: 1 → 2 → 4 → 8, max 8 s. Indicator orange while reconnecting.

## 11. Server lifecycle

- Boot:
  1. Load `config.json`, `wleds.json`.
  2. Crash recovery: scan `/var/lib/wledgame/last-state-*.json` and POST each back to the corresponding WLED. Delete on success.
  3. Start probing all WLEDs in parallel (non-blocking).
  4. Start HTTP+WS server. Service is ready.
- Run: game loop only runs while `phase === 'playing'`. While `idle` or `over`, no UDP frames are sent (the strip runs its own effect).
- Shutdown (SIGINT/SIGTERM): if `playing`, transition to `over`, restore the active WLED's state, then exit. Hard timeout 3 s.

## 12. Logging

- Stdout, single-line: `[ISO-ts] [level] msg key1=v1 key2=v2`.
- Levels: `error warn info debug`. Default `info` from `config.json`.
- Boot: log each WLED probe result.
- Every 5 s during `playing`: `phase=playing fps=29.8 enemies=4 clusters=2 shots=1 score=37 wled=wled-141`.
- Every state transition logged.

## 13. File layout (source dir = `/root/wled_game`)

```
server.js
config.json
wleds.json
package.json
package-lock.json
public/
  index.html
systemd/
  wledgame.service
bin/
  deploy.sh
Makefile
README.md
docs/
  superpowers/
    specs/
      2026-04-30-wledgame-design.md   (this file)
    backlog/
      v0.2-features.md
```

## 14. Deployment

Two locations because `/root` is mode 700 and the systemd service runs as a non-privileged `wledgame` user that cannot read `/root`.

- **Source of truth**: `/root/wled_game/` (edit here).
- **Deployed copy**: `/opt/wledgame/`, owned by `wledgame:wledgame`.
- **State dir**: `/var/lib/wledgame/`, owned by `wledgame:wledgame`.

### Makefile targets

- `make dev` — `node server.js` from the source dir as root, foreground. Fast iteration; still saves/restores WLED state.
- `make deploy` — `rsync -a --delete --exclude=node_modules --exclude=docs --exclude=.git /root/wled_game/ /opt/wledgame/`, then `chown -R wledgame:wledgame /opt/wledgame`, then `cd /opt/wledgame && sudo -u wledgame npm ci --no-audit --no-fund` if `package-lock.json` changed.
- `make restart` — `systemctl restart wledgame && journalctl -u wledgame -n 20`.
- `make logs` — `journalctl -u wledgame -f`.
- `make install-service` — one-time: copy `systemd/wledgame.service` to `/etc/systemd/system/`, `systemctl daemon-reload`, `systemctl enable wledgame` (does NOT start).
- `make status` — `systemctl status wledgame`.

### systemd unit (`systemd/wledgame.service`)

```ini
[Unit]
Description=WLED Game bridge service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=wledgame
WorkingDirectory=/opt/wledgame
ExecStart=/usr/bin/node /opt/wledgame/server.js
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/wledgame
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### One-time setup

```
useradd --system --create-home --shell /usr/sbin/nologin wledgame
mkdir -p /opt/wledgame /var/lib/wledgame
chown -R wledgame:wledgame /opt/wledgame /var/lib/wledgame
make deploy
make install-service
# do NOT make restart yet — operator starts the service manually after first review
```

## 15. Security & safety

- Service is unauthenticated. Acceptable because it's behind nginxproxymanager (separate CT).
- Service binds to `0.0.0.0:8080` on the CT. If port 8080 is taken, server walks up (8081, 8082, …, max 8090) and logs the chosen port. Configurable in `config.json`.
- Service does not kill or interact with other processes.
- WLED state saved before manipulation, restored on every exit path. Realtime timeout is 1 s as a hard safety net.
- No secrets in source tree.

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| WLED unreachable mid-round | UDP frames silently fail; if no frame ACKs (we don't track) game continues. Player sees frozen strip, presses game over manually? **Mitigation: HTTP heartbeat to `/json/info` every 10 s during play; if 3 consecutive fail, broadcast `{type:"error", reason:"wled_lost"}` and force gameOver.** |
| Service crashes mid-round, leaves WLED in realtime mode | Two layers: (a) WLED's own 1 s timeout resumes its effect; (b) on next boot we POST `last-state-<id>.json` back. |
| Two players press "Start" simultaneously with different mode picks | First message wins; second sees `{type:"error", reason:"already_running"}`. State broadcast tells everyone what mode is in effect. |
| `wleds.json` references a host that's permanently gone | Probe times out, entry shown as offline; gameplay unaffected for other entries. |
| Strip > 489 LEDs, multiple DNRGB packets get reordered | Each frame sends chunks in order with 1 ms gap. WLED applies in receive order. Worst case: brief tearing — acceptable for a game. |
| Two browsers fire `shoot` at the exact same ms | Server processes in receive order; each shot gets a unique id. Both shots exist in the world. |

## 17. Open questions

None blocking. Items deferred to v0.2 are listed in `docs/superpowers/backlog/v0.2-features.md`.
