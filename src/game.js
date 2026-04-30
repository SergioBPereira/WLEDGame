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
