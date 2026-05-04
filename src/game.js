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

// Boss types: 'masterblaster' (color-cycle), 'tank' (any color, immune to stuck), 'overlord' (cycle + minions).
// Bosses live on the same cluster track but skip the heads model — collisions consult the boss block.
export function spawnBoss(gs, def, now = Date.now()) {
  gs.clusters.push({
    id: gs.nextId(),
    pos: 0,
    heads: [{ mask: 7, hits: 0 }], // dummy; boss path is taken in resolveCollisions
    boss: {
      type: def.type,
      hp: def.hp,
      maxHp: def.hp,
      cycleMs: def.cycleMs || 0,
      startedAt: now,
      minionEveryMs: def.minionEveryMs || 0,
      lastMinionAt: now,
    },
  });
}

export function bossCurrentMask(boss, now = Date.now()) {
  if (boss.type === 'tank') return 7;        // accepts any color
  if (!boss.cycleMs || boss.cycleMs <= 0) return 7;
  const ph = Math.floor((now - boss.startedAt) / boss.cycleMs) % 3;
  return [1, 2, 4][ph]; // R, G, B
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

export function resolveCollisions(gs, wrongColorMode, now = Date.now()) {
  const events = [];
  const ledStep = 1000 / gs.ledCount;
  const sortedClusters = [...gs.clusters].sort((a, b) => b.pos - a.pos);

  for (const shot of [...gs.shots]) {
    if (shot.pos <= 0) continue;
    const lo = shot.pos - SWEEP_PAD;
    const hi = (shot.prevPos ?? shot.pos) + SWEEP_PAD;
    const target = sortedClusters.find(c => c.pos >= lo && c.pos <= hi);
    if (!target) continue;

    // Boss path: ignore heads model, consult boss block.
    if (target.boss) {
      const cBit = maskFromColor(shot.color);
      const bossMask = bossCurrentMask(target.boss, now);
      const accepts = target.boss.type === 'tank' || (cBit & bossMask) !== 0;
      gs.shots = gs.shots.filter(s => s.id !== shot.id);
      if (accepts) {
        target.boss.hp -= 1;
        gs.score += 1;
        if (target.boss.hp <= 0) {
          const award = target.boss.maxHp; // bonus on full defeat
          gs.score += award;
          gs.clusters = gs.clusters.filter(c => c.id !== target.id);
          events.push({ type: 'bossDefeated', bossType: target.boss.type, scoreDelta: 1 + award });
        } else {
          events.push({ type: 'bossHit', bossType: target.boss.type, color: shot.color, hp: target.boss.hp, maxHp: target.boss.maxHp, scoreDelta: 1 });
        }
      } else {
        // Wrong color on a boss is always 'consumed' (bosses are immune to stuck).
        events.push({ type: 'miss', color: shot.color });
      }
      continue;
    }

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
  gs.endless = !!opts.endless;
  gs.wledId = opts.wledId;
  gs.background = opts.background;
  gs.brightness = opts.brightness ?? 70;
  gs.startedAt = Date.now();
  gs.transitionUntilTs = 0;
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

export function renderEntities(gs, now = Date.now()) {
  const out = [];
  const step = 1000 / gs.ledCount;
  for (const c of gs.clusters) {
    if (c.boss) {
      // Render boss as a 3-LED-wide block in its current accepts-color.
      const mask = bossCurrentMask(c.boss, now);
      const rgb = maskRgb(mask);
      // Subtle HP glow: dim toward dark red as hp drops.
      const hpFrac = c.boss.hp / c.boss.maxHp;
      const dimmed = [
        Math.floor(rgb[0] * (0.55 + 0.45 * hpFrac)),
        Math.floor(rgb[1] * (0.55 + 0.45 * hpFrac)),
        Math.floor(rgb[2] * (0.55 + 0.45 * hpFrac)),
      ];
      for (let i = 0; i < 3; i++) {
        out.push({
          id: `${c.id}:${i}`,
          pos: Math.max(0, c.pos - i * step),
          rgb: dimmed,
        });
      }
      continue;
    }
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
