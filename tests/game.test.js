import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnInterval, enemySpeed, makeIdGen, applyKidsMode, maskFromColor, maskRgb } from '../src/game.js';

const baseGameCfg = {
  spawnBaseMs: 1800, spawnEvery: 5, spawnStepMs: 60, spawnMinMs: 500,
  speedBaseUnitsPerSec: 70, speedEvery: 15, speedFactor: 1.05, speedMaxUnitsPerSec: 220,
  shotSpeedUnitsPerSec: 700,
  kidsSpawnMul: 1.8, kidsSpeedMul: 0.5,
};

test('spawnInterval at score 0 = base', () => {
  assert.equal(spawnInterval(0, baseGameCfg), 1800);
});

test('spawnInterval reaches floor', () => {
  assert.equal(spawnInterval(150, baseGameCfg), 500);
});

test('enemySpeed at score 0 = base', () => {
  assert.equal(enemySpeed(0, baseGameCfg), 70);
});

test('enemySpeed grows but caps at max', () => {
  assert.equal(enemySpeed(1000, baseGameCfg), 220);
});

test('applyKidsMode multiplies the right knobs', () => {
  const k = applyKidsMode(baseGameCfg);
  assert.equal(k.spawnBaseMs, 1800 * 1.8);
  assert.equal(k.speedBaseUnitsPerSec, 70 * 0.5);
});

test('makeIdGen produces unique increasing ids', () => {
  const gen = makeIdGen();
  assert.equal(gen(), 1);
  assert.equal(gen(), 2);
  assert.equal(gen(), 3);
});

import { createGameState, spawnEnemy, advanceEntities } from '../src/game.js';

test('createGameState yields idle phase, empty entities', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  assert.equal(gs.phase, 'idle');
  assert.equal(gs.score, 0);
  assert.deepEqual(gs.clusters, []);
  assert.deepEqual(gs.shots, []);
  assert.equal(gs.fireZoneVirtualSize > 0, true);
});

test('spawnEnemy creates a cluster at pos 0 with one R/G/B color', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  spawnEnemy(gs, 'R');
  assert.equal(gs.clusters.length, 1);
  const c = gs.clusters[0];
  assert.equal(c.masks.length, 1);
  assert.equal(c.masks[0], 1);  // R
  assert.equal(c.pos, 0);
});

test('advanceEntities moves clusters by speed*dtSec', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  spawnEnemy(gs, 'G');
  advanceEntities(gs, 1.0, 100, 700);
  assert.equal(gs.clusters[0].pos, 100);
});

test('advanceEntities removes shots that reach pos 0', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.shots.push({ id: 1, pos: 50, color: 'R' });
  advanceEntities(gs, 1.0, 70, 700);
  assert.equal(gs.shots.length, 0);
});

import { resolveCollisions } from '../src/game.js';

test('consumed mode: same-color shot dissolves single-color cluster', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 500, masks: [1] });
  gs.shots.push({ id: 2, pos: 500, color: 'R' });
  const events = resolveCollisions(gs, 'consumed');
  assert.equal(gs.clusters.length, 0);
  assert.equal(gs.shots.length, 0);
  assert.equal(gs.score, 1);
  assert.deepEqual(events, [{ type: 'hit', color: 'R', scoreDelta: 1 }]);
});

test('consumed mode: wrong-color shot disappears, cluster intact', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 500, masks: [1] });
  gs.shots.push({ id: 2, pos: 500, color: 'G' });
  const events = resolveCollisions(gs, 'consumed');
  assert.equal(gs.clusters.length, 1);
  assert.equal(gs.shots.length, 0);
  assert.equal(gs.score, 0);
  assert.deepEqual(events, [{ type: 'miss', color: 'G' }]);
});

test('shot only resolves against the FIRST cluster it meets (closest to fire)', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 700, masks: [2] });
  gs.clusters.push({ id: 2, pos: 300, masks: [1] });
  gs.shots.push({ id: 3, pos: 700, color: 'R' });
  resolveCollisions(gs, 'consumed');
  assert.equal(gs.clusters.length, 2);
  assert.equal(gs.shots.length, 0);
});

test('stuck mode: wrong-color shot becomes new head, kicks cluster +1 LED', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 500, masks: [1] });
  gs.shots.push({ id: 2, pos: 500, color: 'G' });
  const events = resolveCollisions(gs, 'stuck');
  assert.equal(gs.clusters.length, 1);
  const c = gs.clusters[0];
  assert.deepEqual(c.masks, [2, 1]);
  assert.ok(Math.abs(c.pos - (500 + 1000/60)) < 0.001);
  assert.equal(gs.score, 0);
  assert.deepEqual(events, [{ type: 'stuck', color: 'G' }]);
});

test('stuck mode: same-color shot pops only the head', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 500, masks: [2, 1] });
  gs.shots.push({ id: 2, pos: 500, color: 'G' });
  resolveCollisions(gs, 'stuck');
  assert.equal(gs.clusters.length, 1);
  assert.deepEqual(gs.clusters[0].masks, [1]);
  assert.equal(gs.score, 1);
});

test('stuck mode: cluster fully cleared by sequential matches', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 500, masks: [2, 1, 4] });
  gs.shots.push({ id: 2, pos: 500, color: 'G' });
  resolveCollisions(gs, 'stuck');
  assert.deepEqual(gs.clusters[0].masks, [1, 4]);
  gs.shots.push({ id: 3, pos: gs.clusters[0].pos, color: 'R' });
  resolveCollisions(gs, 'stuck');
  assert.deepEqual(gs.clusters[0].masks, [4]);
  gs.shots.push({ id: 4, pos: gs.clusters[0].pos, color: 'B' });
  resolveCollisions(gs, 'stuck');
  assert.equal(gs.clusters.length, 0);
  assert.equal(gs.score, 3);
});

import { checkGameOver, renderEntities, startRound, gameOver, leadEntityId } from '../src/game.js';

test('checkGameOver: cluster head reaching fire zone returns true', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 1000 - gs.fireZoneVirtualSize + 0.01, masks: [1] });
  assert.equal(checkGameOver(gs), true);
});

test('checkGameOver: just before fire zone returns false', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 1000 - gs.fireZoneVirtualSize - 1, masks: [1] });
  assert.equal(checkGameOver(gs), false);
});

test('startRound transitions idle -> playing, resets score and entities', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.score = 99;
  gs.clusters.push({ id: 5, pos: 500, masks: [2] });
  startRound(gs, {
    wrongColorMode: 'stuck', kidsMode: false, wledId: 'wled-1',
    background: { mode: 'off' }, brightness: 70,
  });
  assert.equal(gs.phase, 'playing');
  assert.equal(gs.score, 0);
  assert.equal(gs.clusters.length, 0);
  assert.equal(gs.wrongColorMode, 'stuck');
  assert.equal(gs.brightness, 70);
});

test('gameOver moves phase to over and sets cooldown', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.phase = 'playing';
  gameOver(gs, 5000, () => 1000);
  assert.equal(gs.phase, 'over');
  assert.equal(gs.overUntilTs, 6000);
});

test('renderEntities flattens clusters with correct trailing positions', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 500, masks: [2, 1, 4] });
  gs.shots.push({ id: 99, pos: 200, color: 'B' });
  const flat = renderEntities(gs);
  const step = 1000 / 60;
  assert.equal(flat.find(e => e.id === '1:0').pos, 500);
  assert.deepEqual(flat.find(e => e.id === '1:0').rgb, [0, 255, 0]);
  assert.ok(Math.abs(flat.find(e => e.id === '1:1').pos - (500 - step)) < 0.001);
  assert.deepEqual(flat.find(e => e.id === 'shot:99').rgb, [0, 0, 255]);
});

test('leadEntityId returns head id of cluster nearest to fire', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 300, masks: [1] });
  gs.clusters.push({ id: 2, pos: 700, masks: [2] });
  assert.equal(leadEntityId(gs), '2:0');
});

test('fast shot does not tunnel past slow cluster (regression)', () => {
  // At 30fps with shotSpeed=700 u/s, a shot moves ~23 units per tick.
  // Simulate one frame where the shot crosses a cluster:
  //   prev positions: shot=210, cluster=195   (15 apart, outside old EPS=8)
  //   post-advance:   shot=187, cluster=197   (10 apart, also outside old EPS=8)
  // The fix must register the hit because the cluster lay in the swept range [187, 210].
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  gs.clusters.push({ id: 1, pos: 197, masks: [1] });
  gs.shots.push({ id: 2, pos: 187, prevPos: 210, color: 'R' });
  const events = resolveCollisions(gs, 'consumed');
  assert.equal(gs.clusters.length, 0, 'cluster should be destroyed');
  assert.equal(gs.score, 1);
  assert.deepEqual(events, [{ type: 'hit', color: 'R', scoreDelta: 1 }]);
});

test('W enemy: hitting with R clears R, mask becomes G+B (cyan)', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  spawnEnemy(gs, 'W');
  gs.clusters[0].pos = 500;
  gs.shots.push({ id: 99, pos: 500, color: 'R' });
  const events = resolveCollisions(gs, 'consumed');
  assert.equal(gs.clusters.length, 1);
  assert.deepEqual(gs.clusters[0].masks, [6]);  // G+B = cyan
  assert.equal(gs.score, 1);
  assert.deepEqual(events, [{ type: 'hit', color: 'R', scoreDelta: 1 }]);
});

test('W enemy: three correct hits in any order defeat it (+3 score)', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  spawnEnemy(gs, 'W');
  gs.clusters[0].pos = 500;
  for (const c of ['B', 'R', 'G']) {
    gs.shots.push({ id: gs.nextId(), pos: gs.clusters[0]?.pos ?? 500, color: c });
    resolveCollisions(gs, 'consumed');
  }
  assert.equal(gs.clusters.length, 0);
  assert.equal(gs.score, 3);
});

test('W enemy stuck mode: shot of already-cleared color attaches as new head', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  spawnEnemy(gs, 'W');
  gs.clusters[0].pos = 500;
  // Hit with R → mask becomes 6 (G+B = cyan)
  gs.shots.push({ id: gs.nextId(), pos: 500, color: 'R' });
  resolveCollisions(gs, 'stuck');
  assert.deepEqual(gs.clusters[0].masks, [6]);
  // Hit with R again — R is no longer in the W head's set. In stuck mode, R sticks as a new single-bit head.
  const posAfterFirst = gs.clusters[0].pos;
  gs.shots.push({ id: gs.nextId(), pos: posAfterFirst, color: 'R' });
  resolveCollisions(gs, 'stuck');
  assert.deepEqual(gs.clusters[0].masks, [1, 6]);  // R head, then cyan W trailing
  assert.ok(gs.clusters[0].pos > posAfterFirst);
});

test('renderEntities emits rgb per entity for W heads', () => {
  const gs = createGameState({ ledCount: 60, fireZoneLeds: 4 });
  spawnEnemy(gs, 'W');
  gs.clusters[0].pos = 500;
  const flat = renderEntities(gs);
  const head = flat.find(e => e.id === '1:0');
  assert.deepEqual(head.rgb, [255, 255, 255]);
});
