import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_DEFS, createLevelManager, levelByIdx, findLevelIdx } from '../src/levels.js';
import {
  createGameState, spawnEnemy, spawnBoss, resolveCollisions,
  bossCurrentMask, renderEntities,
} from '../src/game.js';

test('LEVEL_DEFS structure: 10 normal + 3 bosses + endless', () => {
  const normal = LEVEL_DEFS.filter(l => !l.isBoss && !l.isEndless);
  const bosses = LEVEL_DEFS.filter(l => l.isBoss);
  const endless = LEVEL_DEFS.filter(l => l.isEndless);
  assert.equal(normal.length, 10);
  assert.equal(bosses.length, 3);
  assert.equal(endless.length, 1);
  // Bosses come after L4, L7, L10:
  assert.equal(LEVEL_DEFS[4].id, 'B1');
  assert.equal(LEVEL_DEFS[8].id, 'B2');
  assert.equal(LEVEL_DEFS[12].id, 'B3');
  // Endless is the last entry.
  assert.equal(LEVEL_DEFS[LEVEL_DEFS.length - 1].id, 'ENDLESS');
});

test('LevelManager advances through campaign in order', () => {
  const lm = createLevelManager();
  assert.equal(lm.current().id, 'L1');
  for (let i = 0; i < LEVEL_DEFS.length - 1; i++) {
    assert.equal(lm.advance().id, LEVEL_DEFS[i + 1].id);
  }
  assert.equal(lm.advance(), null); // no more levels after ENDLESS
});

test('LevelManager shouldAdvance: regular level needs all spawned + arena empty', () => {
  const lm = createLevelManager();
  const lv = lm.current();
  // Not yet spawned all:
  assert.equal(lm.shouldAdvance(true), false);
  for (let i = 0; i < lv.enemyCount; i++) lm.markSpawn();
  // All spawned but arena still has enemies:
  assert.equal(lm.shouldAdvance(false), false);
  // All spawned and arena empty:
  assert.equal(lm.shouldAdvance(true), true);
});

test('LevelManager shouldAdvance: boss level needs boss spawned + arena empty', () => {
  const lm = createLevelManager({ startIdx: findLevelIdx('B1') });
  assert.equal(lm.current().id, 'B1');
  assert.equal(lm.shouldAdvance(true), false); // boss not yet on field
  lm.markBossSpawned();
  assert.equal(lm.shouldAdvance(false), false); // boss alive
  assert.equal(lm.shouldAdvance(true), true);  // boss dead, arena empty
});

test('LevelManager shouldAdvance: endless never advances', () => {
  const lm = createLevelManager({ startIdx: findLevelIdx('ENDLESS') });
  for (let i = 0; i < 100; i++) lm.markSpawn();
  assert.equal(lm.shouldAdvance(true), false);
});

test('bossCurrentMask: tank always accepts white', () => {
  const boss = { type: 'tank', cycleMs: 0, startedAt: 0 };
  assert.equal(bossCurrentMask(boss, 0), 7);
  assert.equal(bossCurrentMask(boss, 999999), 7);
});

test('bossCurrentMask: masterblaster cycles R→G→B', () => {
  const boss = { type: 'masterblaster', cycleMs: 1000, startedAt: 0 };
  assert.equal(bossCurrentMask(boss, 0),    1); // R
  assert.equal(bossCurrentMask(boss, 1000), 2); // G
  assert.equal(bossCurrentMask(boss, 2000), 4); // B
  assert.equal(bossCurrentMask(boss, 3000), 1); // back to R
});

test('boss takes hp damage on matching color, immune to wrong color', () => {
  const gs = createGameState({ ledCount: 100, fireZoneLeds: 4 });
  spawnBoss(gs, { type: 'masterblaster', hp: 3, cycleMs: 100000, speed: 50 }, 0);
  const boss = gs.clusters[0].boss;
  // Boss is at pos 0, currentMask at t=0 is R.
  // Move boss into the firing zone for shot collision math.
  gs.clusters[0].pos = 500;
  // Wrong color (G when boss accepts R): no damage.
  gs.shots.push({ id: gs.nextId(), pos: 502, prevPos: 503, color: 'G' });
  let events = resolveCollisions(gs, 'consumed', 0);
  assert.equal(events[0].type, 'miss');
  assert.equal(boss.hp, 3);
  // Right color (R): damage.
  gs.shots.push({ id: gs.nextId(), pos: 502, prevPos: 503, color: 'R' });
  events = resolveCollisions(gs, 'consumed', 0);
  assert.equal(events[0].type, 'bossHit');
  assert.equal(boss.hp, 2);
});

test('boss defeat removes cluster and awards bonus = maxHp', () => {
  const gs = createGameState({ ledCount: 100, fireZoneLeds: 4 });
  spawnBoss(gs, { type: 'tank', hp: 2, cycleMs: 0, speed: 30 }, 0);
  gs.clusters[0].pos = 500;
  // Tank takes any color.
  gs.shots.push({ id: gs.nextId(), pos: 502, prevPos: 503, color: 'B' });
  let events = resolveCollisions(gs, 'consumed', 0);
  assert.equal(events[0].type, 'bossHit');
  assert.equal(gs.clusters.length, 1);
  assert.equal(gs.score, 1);
  gs.shots.push({ id: gs.nextId(), pos: 502, prevPos: 503, color: 'G' });
  events = resolveCollisions(gs, 'consumed', 0);
  assert.equal(events[0].type, 'bossDefeated');
  assert.equal(gs.clusters.length, 0);
  // 1 (last hit) + 2 (maxHp bonus) = 3 added beyond the first hit.
  assert.equal(gs.score, 1 /*first hit*/ + 1 /*killing hit*/ + 2 /*bonus*/);
});

test('boss is immune to stuck mode (wrong color is consumed)', () => {
  const gs = createGameState({ ledCount: 100, fireZoneLeds: 4 });
  spawnBoss(gs, { type: 'masterblaster', hp: 3, cycleMs: 100000, speed: 50 }, 0);
  gs.clusters[0].pos = 500;
  gs.shots.push({ id: gs.nextId(), pos: 502, prevPos: 503, color: 'G' }); // wrong
  resolveCollisions(gs, 'stuck', 0);
  // No extra heads stacked, no negative score.
  assert.equal(gs.clusters[0].heads.length, 1);
  assert.equal(gs.score, 0);
});

test('renderEntities renders boss as 3 LEDs in current cycle color', () => {
  const gs = createGameState({ ledCount: 300, fireZoneLeds: 4 });
  spawnBoss(gs, { type: 'masterblaster', hp: 3, cycleMs: 1000, speed: 50 }, 0);
  gs.clusters[0].pos = 500;
  const out = renderEntities(gs, 0);
  // 3 entities for the boss.
  assert.equal(out.length, 3);
  // All red at t=0 (with HP-glow dim factor 1.0 at full hp).
  for (const e of out) {
    assert.ok(e.rgb[0] > 0);
    assert.equal(e.rgb[1], 0);
    assert.equal(e.rgb[2], 0);
  }
});

test('regular enemies still work (no regression)', () => {
  const gs = createGameState({ ledCount: 100, fireZoneLeds: 4 });
  spawnEnemy(gs, 'R');
  gs.clusters[0].pos = 500;
  gs.shots.push({ id: gs.nextId(), pos: 502, prevPos: 503, color: 'R' });
  const events = resolveCollisions(gs, 'consumed', 0);
  assert.equal(events[0].type, 'hit');
  assert.equal(gs.clusters.length, 0);
  assert.equal(gs.score, 1);
});
