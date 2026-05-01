import {
  createGameState, startRound, gameOver, checkGameOver, advanceEntities,
  spawnEnemy, resolveCollisions, renderEntities, leadEntityId,
  spawnInterval, enemySpeed, applyKidsMode,
} from './game.js';
import { renderFrame } from './render.js';
import { log } from './log.js';

const COLORS = ['R', 'G', 'B'];

export function createGameRunner({ cfg, wledStore, sender, broadcast, broadcastFrame = () => {} }) {
  let gs = null;
  let activeWled = null;
  let loopTimer = null;
  let lastFrameTs = 0;
  let lastSpawnTs = 0;
  let logTimer = null;
  let frameCount = 0;
  let lastFpsLog = 0;

  function reset(ledCount) {
    gs = createGameState({ ledCount, fireZoneLeds: cfg.fireZoneLeds });
  }

  async function start({ wledId, wrongColorMode, kidsMode, wEnemies, background, brightness }) {
    if (gs && gs.phase === 'playing') return { ok: false, reason: 'already_running' };
    if (gs && gs.phase === 'over' && Date.now() < gs.overUntilTs) {
      return { ok: false, reason: 'cooldown', retryInMs: gs.overUntilTs - Date.now() };
    }
    const w = wledStore.get(wledId);
    if (!w) return { ok: false, reason: 'unknown_wled' };
    if (!w.online) {
      await wledStore.probeAll(1500);
      if (!w.online) return { ok: false, reason: 'wled_unreachable' };
    }
    activeWled = w;
    reset(w.ledCount);
    try { await wledStore.saveStateFor(w.id); }
    catch (e) { log.warn('save state failed, continuing', { error: String(e.message || e) }); }
    startRound(gs, { wrongColorMode, kidsMode, wEnemies, wledId: w.id, background, brightness });
    lastFrameTs = Date.now();
    lastSpawnTs = lastFrameTs;
    broadcast(stateMessage());
    if (!loopTimer) {
      const interval = Math.max(10, Math.floor(1000 / cfg.targetFps));
      loopTimer = setInterval(tick, interval);
    }
    if (!logTimer) {
      logTimer = setInterval(() => {
        if (gs?.phase === 'playing') {
          const now = Date.now();
          const fps = (now - lastFpsLog) > 0 ? (frameCount * 1000 / (now - lastFpsLog)) : 0;
          frameCount = 0; lastFpsLog = now;
          log.info('tick', { phase: gs.phase, fps: fps.toFixed(1), clusters: gs.clusters.length, shots: gs.shots.length, score: gs.score, wled: gs.wledId });
        }
      }, 5000);
    }
    return { ok: true };
  }

  function setBrightness(value) {
    if (gs) gs.brightness = value;
  }

  function shoot(color) {
    if (!gs || gs.phase !== 'playing') return;
    const fireBoundary = 1000 - gs.fireZoneVirtualSize;
    gs.shots.push({ id: gs.nextId(), pos: fireBoundary, color });
  }

  async function tick() {
    if (!gs) return;
    const now = Date.now();
    const dtSec = Math.max(0.001, Math.min(0.1, (now - lastFrameTs) / 1000));
    lastFrameTs = now;
    frameCount++;

    if (gs.phase === 'over' && now >= gs.overUntilTs) {
      gs.phase = 'idle';
      broadcast(stateMessage());
    }
    if (gs.phase !== 'playing') return;

    const cur = gs.kidsMode ? applyKidsMode(cfg.game) : cfg.game;
    const spawnEvery = spawnInterval(gs.score, cur);
    if (now - lastSpawnTs >= spawnEvery) {
      let c;
      if (gs.wEnemies && Math.random() < 0.10) {
        c = 'W';
      } else {
        c = COLORS[Math.floor(Math.random() * COLORS.length)];
      }
      spawnEnemy(gs, c);
      lastSpawnTs = now;
    }

    advanceEntities(gs, dtSec, enemySpeed(gs.score, cur), cur.shotSpeedUnitsPerSec);

    const events = resolveCollisions(gs, gs.wrongColorMode);
    for (const e of events) broadcast(e);
    if (events.some(e => e.type === 'hit')) broadcast(stateMessage());

    if (checkGameOver(gs)) {
      gameOver(gs, cfg.game.gameOverCooldownMs);
      broadcast({ type: 'gameOver', score: gs.score, cooldownMs: cfg.game.gameOverCooldownMs });
      broadcast(stateMessage());
      try { await wledStore.restoreStateFor(activeWled.id); } catch (e) {
        log.warn('restore failed', { error: String(e.message || e) });
      }
      activeWled = null;
      return;
    }

    const flat = renderEntities(gs);
    const leadId = leadEntityId(gs);
    const frame = renderFrame({
      ledCount: gs.ledCount,
      t: (now - gs.startedAt) / 1000,
      background: gs.background,
      entities: flat,
      leadId,
      brightness: gs.brightness,
      cfg,
    });
    if (activeWled) {
      sender.sendFrame({ host: activeWled.host, udpPort: activeWled.udpPort }, frame).catch(err => {
        log.warn('udp send failed', { error: String(err.message || err) });
      });
    }
    broadcastFrame(frame);
  }

  function stateMessage() {
    return {
      type: 'state',
      phase: gs?.phase ?? 'idle',
      score: gs?.score ?? 0,
      wledId: gs?.wledId ?? null,
      wrongColorMode: gs?.wrongColorMode ?? null,
      kidsMode: !!gs?.kidsMode,
      wEnemies: !!gs?.wEnemies,
      background: gs?.background ?? { mode: 'off' },
      brightness: gs?.brightness ?? 70,
    };
  }

  function snapshot() { return stateMessage(); }

  async function shutdown() {
    if (loopTimer) clearInterval(loopTimer);
    if (logTimer) clearInterval(logTimer);
    if (activeWled && gs?.phase === 'playing') {
      try { await wledStore.restoreStateFor(activeWled.id); } catch (_) {}
    }
  }

  return { start, shoot, setBrightness, snapshot, shutdown };
}
