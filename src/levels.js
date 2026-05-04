// Campaign definition: 10 ordinary levels + 3 bosses interleaved + endless coda.
// Bosses are placed after L4, L7, L10 (per backlog item A).
//
// Level shape:
//   { id, displayName, isBoss?, isEndless?, enemyCount?, spawnIntervalMs?,
//     enemySpeed?, wChance?, boss?: { type, hp, cycleMs, speed, minionEveryMs? } }
//
// "wChance" is only consulted if the player enabled the W-enemies option.
// Endless mode scales spawn/speed using the v0.1 score-based formulas.

export const LEVEL_DEFS = [
  { id: 'L1',  displayName: 'Level 1',  enemyCount:  8, spawnIntervalMs: 1800, enemySpeed:  50, wChance: 0.00 },
  { id: 'L2',  displayName: 'Level 2',  enemyCount: 10, spawnIntervalMs: 1700, enemySpeed:  55, wChance: 0.00 },
  { id: 'L3',  displayName: 'Level 3',  enemyCount: 12, spawnIntervalMs: 1600, enemySpeed:  60, wChance: 0.05 },
  { id: 'L4',  displayName: 'Level 4',  enemyCount: 14, spawnIntervalMs: 1500, enemySpeed:  70, wChance: 0.05 },
  { id: 'B1',  displayName: 'Boss: Masterblaster', isBoss: true,
    boss: { type: 'masterblaster', hp:  6, cycleMs: 1500, speed:  85 } },
  { id: 'L5',  displayName: 'Level 5',  enemyCount: 16, spawnIntervalMs: 1400, enemySpeed:  80, wChance: 0.07 },
  { id: 'L6',  displayName: 'Level 6',  enemyCount: 18, spawnIntervalMs: 1350, enemySpeed:  90, wChance: 0.10 },
  { id: 'L7',  displayName: 'Level 7',  enemyCount: 20, spawnIntervalMs: 1300, enemySpeed: 100, wChance: 0.10 },
  { id: 'B2',  displayName: 'Boss: The Tank', isBoss: true,
    boss: { type: 'tank',          hp: 12, cycleMs:    0, speed:  35 } },
  { id: 'L8',  displayName: 'Level 8',  enemyCount: 22, spawnIntervalMs: 1200, enemySpeed: 110, wChance: 0.12 },
  { id: 'L9',  displayName: 'Level 9',  enemyCount: 24, spawnIntervalMs: 1100, enemySpeed: 120, wChance: 0.15 },
  { id: 'L10', displayName: 'Level 10', enemyCount: 26, spawnIntervalMs: 1000, enemySpeed: 130, wChance: 0.15 },
  { id: 'B3',  displayName: 'Boss: RGB Overlord', isBoss: true,
    boss: { type: 'overlord',      hp: 20, cycleMs: 1000, speed:  85, minionEveryMs: 4000 } },
  { id: 'ENDLESS', displayName: 'Endless', isEndless: true },
];

export function levelByIdx(idx) {
  if (idx < 0 || idx >= LEVEL_DEFS.length) return null;
  return LEVEL_DEFS[idx];
}

export function findLevelIdx(id) {
  return LEVEL_DEFS.findIndex(l => l.id === id);
}

// LevelManager tracks campaign progression for one round.
//   startIdx: 0 by default; pass findLevelIdx('ENDLESS') to start in endless.
//
// State machine:
//   - Each level has a phase: 'spawning' (still emitting enemies / boss not yet on field)
//     and 'clearing' (no more spawns; waiting for arena to empty / boss to die).
//   - shouldAdvance() returns true when arena is empty AND clearing.
//   - advance() moves to the next level and resets per-level counters.
export function createLevelManager({ startIdx = 0 } = {}) {
  let idx = startIdx;
  let enemiesSpawned = 0;
  let bossSpawned = false;
  let levelStartedAt = Date.now();

  function current() { return levelByIdx(idx); }

  function reset(newIdx = 0, now = Date.now()) {
    idx = newIdx;
    enemiesSpawned = 0;
    bossSpawned = false;
    levelStartedAt = now;
  }

  function markSpawn() { enemiesSpawned += 1; }
  function markBossSpawned() { bossSpawned = true; }

  // arenaEmpty — caller-provided check: no clusters and no shots remain.
  function shouldAdvance(arenaEmpty) {
    const lv = current();
    if (!lv) return false;
    if (lv.isEndless) return false;
    if (lv.isBoss) {
      // boss level clears when boss has been spawned and arena is empty (boss dead, no minions left).
      return bossSpawned && arenaEmpty;
    }
    return enemiesSpawned >= lv.enemyCount && arenaEmpty;
  }

  function isAllSpawned() {
    const lv = current();
    if (!lv) return true;
    if (lv.isBoss) return bossSpawned;
    if (lv.isEndless) return false;
    return enemiesSpawned >= lv.enemyCount;
  }

  function advance(now = Date.now()) {
    const next = idx + 1;
    if (next >= LEVEL_DEFS.length) return null;
    idx = next;
    enemiesSpawned = 0;
    bossSpawned = false;
    levelStartedAt = now;
    return current();
  }

  function snapshot() {
    const lv = current();
    return {
      idx,
      id: lv?.id ?? null,
      displayName: lv?.displayName ?? null,
      isBoss: !!lv?.isBoss,
      isEndless: !!lv?.isEndless,
      enemiesSpawned,
      enemiesTotal: lv?.enemyCount ?? null,
      bossSpawned,
      levelStartedAt,
    };
  }

  return {
    current, reset, advance, markSpawn, markBossSpawned,
    shouldAdvance, isAllSpawned, snapshot,
    get idx() { return idx; },
    get bossSpawned() { return bossSpawned; },
  };
}
