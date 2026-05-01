// Channel masks. R=1, G=2, B=4. Combinations: Y=3 (R+G), M=5 (R+B), C=6 (G+B), W=7 (R+G+B).
const COLOR_TO_MASK = { R: 1, G: 2, B: 4, W: 7 };

export function maskFromColor(c) {
  const m = COLOR_TO_MASK[c];
  if (m === undefined) throw new Error(`bad color: ${c}`);
  return m;
}

export function maskRgb(m) {
  return [(m & 1) ? 255 : 0, (m & 2) ? 255 : 0, (m & 4) ? 255 : 0];
}

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
    heads: [{ mask: maskFromColor(color), hits: 0 }],
  });
}

export function advanceEntities(gs, dtSec, enemyUnitsPerSec, shotUnitsPerSec) {
  for (const c of gs.clusters) {
    c.pos += enemyUnitsPerSec * dtSec;
  }
  for (const s of gs.shots) {
    s.prevPos = s.pos;
    s.pos -= shotUnitsPerSec * dtSec;
  }
  gs.shots = gs.shots.filter(s => s.pos > 0);
}

const SWEEP_PAD = 4.0;  // covers cluster motion within the same frame + numerical jitter

export function resolveCollisions(gs, wrongColorMode) {
  const events = [];
  const ledStep = 1000 / gs.ledCount;
  const sortedClusters = [...gs.clusters].sort((a, b) => b.pos - a.pos);

  for (const shot of [...gs.shots]) {
    if (shot.pos <= 0) continue;
    const lo = shot.pos - SWEEP_PAD;
    const hi = (shot.prevPos ?? shot.pos) + SWEEP_PAD;
    const target = sortedClusters.find(c => c.pos >= lo && c.pos <= hi);
    if (!target) continue;

    const headRec = target.heads[0];
    const cBit = maskFromColor(shot.color);

    if (headRec.mask & cBit) {
      // Channel hit. Clear that bit; award score only on full defeat of this head.
      headRec.mask &= ~cBit;
      headRec.hits += 1;
      gs.shots = gs.shots.filter(s => s.id !== shot.id);
      if (headRec.mask === 0) {
        const award = headRec.hits;
        gs.score += award;
        target.heads.shift();
        events.push({ type: 'hit', color: shot.color, scoreDelta: award });
        if (target.heads.length === 0) {
          gs.clusters = gs.clusters.filter(c => c.id !== target.id);
        }
      } else {
        // Channel cleared but head not yet defeated (W mid-fight). No score awarded yet.
        events.push({ type: 'hit', color: shot.color, scoreDelta: 0 });
      }
    } else if (wrongColorMode === 'consumed') {
      gs.shots = gs.shots.filter(s => s.id !== shot.id);
      events.push({ type: 'miss', color: shot.color });
    } else if (wrongColorMode === 'stuck') {
      target.heads.unshift({ mask: cBit, hits: 0 });
      target.pos = Math.min(1000, target.pos + ledStep);
      gs.shots = gs.shots.filter(s => s.id !== shot.id);
      gs.score -= 1;  // anti-grinding: sticking a head costs a point.
      events.push({ type: 'stuck', color: shot.color, scoreDelta: -1 });
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
  gs.wEnemies = !!opts.wEnemies;
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
    for (let i = 0; i < c.heads.length; i++) {
      out.push({
        id: `${c.id}:${i}`,
        pos: Math.max(0, c.pos - i * step),
        rgb: maskRgb(c.heads[i].mask),
      });
    }
  }
  for (const s of gs.shots) {
    out.push({ id: `shot:${s.id}`, pos: s.pos, rgb: maskRgb(maskFromColor(s.color)) });
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
