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
