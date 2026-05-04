import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupKey, loadHighscores, saveHighscores, recordScore, getBest } from '../src/highscores.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'hs-')); }

test('setupKey is deterministic and folds gameplay-affecting opts', () => {
  const a = setupKey({ wledId: 'wA', wrongColorMode: 'consumed', kidsMode: false, wEnemies: false, endless: false });
  const b = setupKey({ wledId: 'wA', wrongColorMode: 'consumed', kidsMode: false, wEnemies: false, endless: false });
  assert.equal(a, b);
  assert.notEqual(a, setupKey({ wledId: 'wA', wrongColorMode: 'stuck', kidsMode: false, wEnemies: false, endless: false }));
  assert.notEqual(a, setupKey({ wledId: 'wA', wrongColorMode: 'consumed', kidsMode: true,  wEnemies: false, endless: false }));
  assert.notEqual(a, setupKey({ wledId: 'wA', wrongColorMode: 'consumed', kidsMode: false, wEnemies: true,  endless: false }));
  assert.notEqual(a, setupKey({ wledId: 'wA', wrongColorMode: 'consumed', kidsMode: false, wEnemies: false, endless: true  }));
  assert.notEqual(a, setupKey({ wledId: 'wB', wrongColorMode: 'consumed', kidsMode: false, wEnemies: false, endless: false }));
});

test('recordScore inserts a new key and persists', () => {
  const dir = tmp();
  let hs = loadHighscores(dir);
  assert.deepEqual(hs.entries, {});
  const r = recordScore(hs, 'k', 50, 1000);
  assert.equal(r.changed, true);
  assert.equal(r.prev, null);
  assert.deepEqual(r.current, { score: 50, ts: 1000 });
  saveHighscores(dir, hs);
  // Round-trip through disk:
  const reread = loadHighscores(dir);
  assert.deepEqual(reread.entries.k, { score: 50, ts: 1000 });
});

test('recordScore promotes only on strictly higher score', () => {
  const hs = { entries: {} };
  recordScore(hs, 'k', 50, 1);
  const tie = recordScore(hs, 'k', 50, 2);
  assert.equal(tie.changed, false, 'ties should not be promoted');
  assert.equal(hs.entries.k.ts, 1, 'ts should not be updated by a tie');
  const beat = recordScore(hs, 'k', 51, 3);
  assert.equal(beat.changed, true);
  assert.deepEqual(hs.entries.k, { score: 51, ts: 3 });
});

test('getBest returns null for unknown key', () => {
  const hs = { entries: { a: { score: 10, ts: 0 } } };
  assert.deepEqual(getBest(hs, 'a'), { score: 10, ts: 0 });
  assert.equal(getBest(hs, 'b'), null);
});

test('loadHighscores tolerates a missing or corrupt file', () => {
  const dir = tmp();
  assert.deepEqual(loadHighscores(dir).entries, {});
  writeFileSync(join(dir, 'highscores.json'), '{ this is not json');
  assert.deepEqual(loadHighscores(dir).entries, {});
  writeFileSync(join(dir, 'highscores.json'), '"a string, not an object"');
  assert.deepEqual(loadHighscores(dir).entries, {});
});
