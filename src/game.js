export function makeIdGen() {
  let n = 0;
  return () => ++n;
}

export function spawnInterval(score, gc) {
  const v = gc.spawnBaseMs - Math.floor(score / gc.spawnEvery) * gc.spawnStepMs;
  return Math.max(gc.spawnMinMs, v);
}

export function enemySpeed(score, gc) {
  const v = gc.speedBaseUnitsPerSec * Math.pow(gc.speedFactor, Math.floor(score / gc.speedEvery));
  return Math.min(gc.speedMaxUnitsPerSec, v);
}

export function applyKidsMode(gc) {
  return {
    ...gc,
    spawnBaseMs: gc.spawnBaseMs * gc.kidsSpawnMul,
    speedBaseUnitsPerSec: gc.speedBaseUnitsPerSec * gc.kidsSpeedMul,
    spawnStepMs: 0,
    speedFactor: 1.0,
  };
}

export function createGameState({ ledCount, fireZoneLeds }) {
  return {
    phase: 'idle',
    score: 0,
    clusters: [],
    shots: [],
    ledCount,
    fireZoneLeds,
    fireZoneVirtualSize: 1000 * fireZoneLeds / ledCount,
    nextId: makeIdGen(),
    overUntilTs: 0,
  };
}

export function spawnEnemy(gs, color) {
  gs.clusters.push({
    id: gs.nextId(),
    pos: 0,
    colors: [color],
  });
}

export function advanceEntities(gs, dtSec, enemyUnitsPerSec, shotUnitsPerSec) {
  for (const c of gs.clusters) {
    c.pos += enemyUnitsPerSec * dtSec;
  }
  for (const s of gs.shots) {
    s.pos -= shotUnitsPerSec * dtSec;
  }
  gs.shots = gs.shots.filter(s => s.pos > 0);
}

const COLLISION_EPS = 8.0;

export function resolveCollisions(gs, wrongColorMode) {
  const events = [];
  const ledStep = 1000 / gs.ledCount;
  const sortedClusters = [...gs.clusters].sort((a, b) => b.pos - a.pos);

  for (const shot of [...gs.shots]) {
    if (shot.pos <= 0) continue;
    const target = sortedClusters.find(c =>
      c.pos >= shot.pos - COLLISION_EPS && c.pos <= shot.pos + COLLISION_EPS
    );
    if (!target) continue;

    const headColor = target.colors[0];
    if (shot.color === headColor) {
      target.colors.shift();
      gs.shots = gs.shots.filter(s => s.id !== shot.id);
      gs.score += 1;
      events.push({ type: 'hit', color: shot.color, scoreDelta: 1 });
      if (target.colors.length === 0) {
        gs.clusters = gs.clusters.filter(c => c.id !== target.id);
      }
    } else if (wrongColorMode === 'consumed') {
      gs.shots = gs.shots.filter(s => s.id !== shot.id);
      events.push({ type: 'miss', color: shot.color });
    } else if (wrongColorMode === 'stuck') {
      target.colors.unshift(shot.color);
      target.pos = Math.min(1000, target.pos + ledStep);
      gs.shots = gs.shots.filter(s => s.id !== shot.id);
      events.push({ type: 'stuck', color: shot.color });
    }
  }
  return events;
}

export function startRound(gs, opts) {
  gs.phase = 'playing';
  gs.score = 0;
  gs.clusters = [];
  gs.shots = [];
  gs.wrongColorMode = opts.wrongColorMode;
  gs.kidsMode = !!opts.kidsMode;
  gs.wledId = opts.wledId;
  gs.background = opts.background;
  gs.brightness = opts.brightness ?? 70;
  gs.startedAt = Date.now();
}

export function gameOver(gs, cooldownMs, nowFn = Date.now) {
  gs.phase = 'over';
  gs.overUntilTs = nowFn() + cooldownMs;
}

export function checkGameOver(gs) {
  const fireBoundary = 1000 - gs.fireZoneVirtualSize;
  for (const c of gs.clusters) {
    if (c.pos >= fireBoundary) return true;
  }
  return false;
}

export function renderEntities(gs) {
  const out = [];
  const step = 1000 / gs.ledCount;
  for (const c of gs.clusters) {
    for (let i = 0; i < c.colors.length; i++) {
      out.push({
        id: `${c.id}:${i}`,
        pos: Math.max(0, c.pos - i * step),
        color: c.colors[i],
      });
    }
  }
  for (const s of gs.shots) {
    out.push({ id: `shot:${s.id}`, pos: s.pos, color: s.color });
  }
  out.sort((a, b) => {
    function rank(e) {
      if (e.id.startsWith('shot:')) return 2;
      const idx = Number(e.id.split(':')[1]);
      return idx === 0 ? 1 : 0;
    }
    return rank(a) - rank(b);
  });
  return out;
}

export function leadEntityId(gs) {
  if (gs.clusters.length === 0) return null;
  let best = gs.clusters[0];
  for (const c of gs.clusters) if (c.pos > best.pos) best = c;
  return `${best.id}:0`;
}
