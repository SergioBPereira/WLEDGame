import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnInterval, enemySpeed, makeIdGen, applyKidsMode } from '../src/game.js';

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
  assert.equal(c.colors.length, 1);
  assert.equal(c.colors[0], 'R');
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
