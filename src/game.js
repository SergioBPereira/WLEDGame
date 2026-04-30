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
