import {
  createGameState, startRound, gameOver, checkGameOver, advanceEntities,
  spawnEnemy, spawnBoss, resolveCollisions, renderEntities, leadEntityId,
  spawnInterval, enemySpeed, applyKidsMode,
} from './game.js';
import { renderFrame } from './render.js';
import { createLevelManager, findLevelIdx } from './levels.js';
import { loadProgression, saveProgression } from './progression.js';
import { log } from './log.js';

const COLORS = ['R', 'G', 'B'];
const TRANSITION_MS = 1500;

export function createGameRunner({ cfg, wledStore, sender, broadcast, broadcastFrame = () => {} }) {
  let gs = null;
  let levelMgr = null;
  let activeWled = null;
  let loopTimer = null;
  let lastFrameTs = 0;
  let lastSpawnTs = 0;
  let logTimer = null;
  let frameCount = 0;
  let lastFpsLog = 0;
  let progression = loadProgression(cfg.stateDir);

  function reset(ledCount) {
    gs = createGameState({ ledCount, fireZoneLeds: cfg.fireZoneLeds });
  }

  async function start({ wledId, wrongColorMode, kidsMode, wEnemies, background, brightness, endless }) {
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
    if (endless && !progression.endlessUnlocked) {
      return { ok: false, reason: 'endless_locked' };
    }
    activeWled = w;
    reset(w.ledCount);
    try { await wledStore.saveStateFor(w.id); }
    catch (e) { log.warn('save state failed, continuing', { error: String(e.message || e) }); }
    startRound(gs, { wrongColorMode, kidsMode, wEnemies, endless, wledId: w.id, background, brightness });
    const startIdx = endless ? findLevelIdx('ENDLESS') : 0;
    levelMgr = createLevelManager({ startIdx });
    enterLevelTransition(levelMgr.current(), Date.now());
    lastFrameTs = Date.now();
    lastSpawnTs = lastFrameTs;
    broadcast(stateMessage());
    if (!loopTimer) {
      const interval = Math.max(10, Math.floor(1000 / cfg.targetFps));
      loopTimer = setInterval(tick, interval);
    }
    if (!logTimer) {
      logTimer = setInterval(() => {
        if (gs?.phase === 'playing' || gs?.phase === 'levelTransition') {
          const now = Date.now();
          const fps = (now - lastFpsLog) > 0 ? (frameCount * 1000 / (now - lastFpsLog)) : 0;
          frameCount = 0; lastFpsLog = now;
          log.info('tick', {
            phase: gs.phase, fps: fps.toFixed(1), level: levelMgr?.current()?.id,
            clusters: gs.clusters.length, shots: gs.shots.length, score: gs.score, wled: gs.wledId,
          });
        }
      }, 5000);
    }
    return { ok: true };
  }

  function enterLevelTransition(level, now) {
    gs.phase = 'levelTransition';
    gs.transitionUntilTs = now + TRANSITION_MS;
    gs.currentLevel = {
      id: level.id, displayName: level.displayName,
      isBoss: !!level.isBoss, isEndless: !!level.isEndless,
    };
    broadcast({ type: 'levelStart', level: gs.currentLevel });
  }

  function exitLevelTransition(now) {
    gs.phase = 'playing';
    gs.transitionUntilTs = 0;
    lastSpawnTs = now;
    // Spawn the boss immediately if applicable.
    const lv = levelMgr.current();
    if (lv?.isBoss && !levelMgr.bossSpawned) {
      spawnBoss(gs, lv.boss, now);
      levelMgr.markBossSpawned();
    }
  }

  function setBrightness(value) {
    if (gs) gs.brightness = value;
  }

  function shoot(color) {
    if (!gs || gs.phase !== 'playing') return;
    const fireBoundary = 1000 - gs.fireZoneVirtualSize;
    gs.shots.push({ id: gs.nextId(), pos: fireBoundary, color });
  }

  // Spawn rate / enemy speed for the current level, accounting for kids mode and endless scaling.
  function levelSpawnIntervalMs(lv, now) {
    if (lv.isEndless) {
      const cur = gs.kidsMode ? applyKidsMode(cfg.game) : cfg.game;
      return spawnInterval(gs.score, cur);
    }
    let v = lv.spawnIntervalMs;
    if (gs.kidsMode) v *= cfg.game.kidsSpawnMul ?? 1.6;
    return v;
  }

  function levelEnemySpeed(lv) {
    if (lv.isEndless) {
      const cur = gs.kidsMode ? applyKidsMode(cfg.game) : cfg.game;
      return enemySpeed(gs.score, cur);
    }
    let v = lv.enemySpeed;
    if (gs.kidsMode) v *= cfg.game.kidsSpeedMul ?? 0.6;
    if (lv.isBoss) v = lv.boss.speed;
    return v;
  }

  function pickRegularColor(lv) {
    const wAllowed = gs.wEnemies && (lv.wChance ?? 0) > 0;
    if (wAllowed && Math.random() < lv.wChance) return 'W';
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  async function tick() {
    if (!gs) return;
    const now = Date.now();
    const dtSec = Math.max(0.001, Math.min(0.1, (now - lastFrameTs) / 1000));
    lastFrameTs = now;
    frameCount++;

    // ── Phase transitions ─────────────────────────────────────────────────
    if (gs.phase === 'over' && now >= gs.overUntilTs) {
      gs.phase = 'idle';
      broadcast(stateMessage());
    }
    if (gs.phase === 'idle' || gs.phase === 'over') return;

    if (gs.phase === 'levelTransition') {
      // During transition, no spawning, no advancing — just render a calm frame and wait.
      if (now >= gs.transitionUntilTs) {
        exitLevelTransition(now);
        broadcast(stateMessage());
      }
      // Still render so the strip + preview show the transition state.
      const flat = renderEntities(gs, now);
      const frame = renderFrame({
        ledCount: gs.ledCount, t: (now - gs.startedAt) / 1000,
        background: gs.background, entities: flat,
        leadId: leadEntityId(gs), brightness: gs.brightness, cfg,
      });
      if (activeWled) {
        sender.sendFrame({ host: activeWled.host, udpPort: activeWled.udpPort }, frame).catch(err => {
          log.warn('udp send failed', { error: String(err.message || err) });
        });
      }
      broadcastFrame(frame);
      return;
    }

    // ── Playing ──────────────────────────────────────────────────────────
    const lv = levelMgr.current();
    const spawnEvery = levelSpawnIntervalMs(lv, now);
    const speed      = levelEnemySpeed(lv);

    // Regular spawning. Boss levels: only the Overlord spawns minions periodically.
    if (lv.isBoss) {
      if (lv.boss.type === 'overlord') {
        const bossCluster = gs.clusters.find(c => c.boss);
        if (bossCluster && now - bossCluster.boss.lastMinionAt >= bossCluster.boss.minionEveryMs) {
          spawnEnemy(gs, COLORS[Math.floor(Math.random() * COLORS.length)]);
          bossCluster.boss.lastMinionAt = now;
        }
      }
    } else if (!levelMgr.isAllSpawned() && now - lastSpawnTs >= spawnEvery) {
      spawnEnemy(gs, pickRegularColor(lv));
      levelMgr.markSpawn();
      lastSpawnTs = now;
    }

    advanceEntities(gs, dtSec, speed, cfg.game.shotSpeedUnitsPerSec);

    const events = resolveCollisions(gs, gs.wrongColorMode, now);
    for (const e of events) broadcast(e);
    if (events.some(e => (e.scoreDelta ?? 0) !== 0)) broadcast(stateMessage());

    if (checkGameOver(gs)) {
      gameOver(gs, cfg.game.gameOverCooldownMs);
      broadcast({ type: 'gameOver', score: gs.score, cooldownMs: cfg.game.gameOverCooldownMs, levelReached: lv.id });
      broadcast(stateMessage());
      try { await wledStore.restoreStateFor(activeWled.id); } catch (e) {
        log.warn('restore failed', { error: String(e.message || e) });
      }
      activeWled = null;
      return;
    }

    // ── Level advance ────────────────────────────────────────────────────
    // Only enemies (clusters) gate level clear. Player shots in flight don't —
    // otherwise a trigger-happy player can stall the entire campaign.
    const arenaEmpty = gs.clusters.length === 0;
    if (levelMgr.shouldAdvance(arenaEmpty)) {
      const next = levelMgr.advance(now);
      if (!next) {
        // Campaign complete!
        if (!progression.endlessUnlocked) {
          progression.endlessUnlocked = true;
          saveProgression(cfg.stateDir, progression).catch(e =>
            log.warn('save progression failed', { error: String(e.message || e) }));
        }
        broadcast({ type: 'campaignComplete', score: gs.score });
        // Transition to "over" — campaign clear is a victory condition, no game-over flash.
        gameOver(gs, cfg.game.gameOverCooldownMs);
        broadcast({ type: 'gameOver', score: gs.score, cooldownMs: cfg.game.gameOverCooldownMs, victory: true, levelReached: lv.id });
        broadcast(stateMessage());
        try { await wledStore.restoreStateFor(activeWled.id); } catch (_) {}
        activeWled = null;
        return;
      }
      enterLevelTransition(next, now);
      broadcast(stateMessage());
    }

    const flat = renderEntities(gs, now);
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
    const lvSnap = levelMgr?.snapshot() ?? null;
    return {
      type: 'state',
      phase: gs?.phase ?? 'idle',
      score: gs?.score ?? 0,
      wledId: gs?.wledId ?? null,
      wrongColorMode: gs?.wrongColorMode ?? null,
      kidsMode: !!gs?.kidsMode,
      wEnemies: !!gs?.wEnemies,
      endless: !!gs?.endless,
      background: gs?.background ?? { mode: 'off' },
      brightness: gs?.brightness ?? 70,
      level: lvSnap,
      transitionUntilTs: gs?.transitionUntilTs ?? 0,
      endlessUnlocked: !!progression.endlessUnlocked,
    };
  }

  function snapshot() { return stateMessage(); }

  async function shutdown() {
    if (loopTimer) clearInterval(loopTimer);
    if (logTimer) clearInterval(logTimer);
    if (activeWled && (gs?.phase === 'playing' || gs?.phase === 'levelTransition')) {
      try { await wledStore.restoreStateFor(activeWled.id); } catch (_) {}
    }
  }

  return { start, shoot, setBrightness, snapshot, shutdown };
}
