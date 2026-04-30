import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHex, baseColor, whiteMix, satAdd } from '../src/color.js';

test('parseHex parses #RRGGBB', () => {
  assert.deepEqual(parseHex('#ff0000'), [255, 0, 0]);
  assert.deepEqual(parseHex('#00FF00'), [0, 255, 0]);
  assert.deepEqual(parseHex('#0033ff'), [0, 51, 255]);
});

test('parseHex throws on bad input', () => {
  assert.throws(() => parseHex('abc'));
  assert.throws(() => parseHex('#zzzzzz'));
});

test('baseColor returns full saturation per channel', () => {
  assert.deepEqual(baseColor('R'), [255, 0, 0]);
  assert.deepEqual(baseColor('G'), [0, 255, 0]);
  assert.deepEqual(baseColor('B'), [0, 0, 255]);
});

test('whiteMix blends toward white', () => {
  assert.deepEqual(whiteMix([0, 0, 0], 1.0), [255, 255, 255]);
  const m = whiteMix([255, 0, 0], 0.5);
  assert.equal(m[0], 255);
  assert.equal(m[1], 127);
  assert.equal(m[2], 127);
});

test('satAdd clamps at 255', () => {
  assert.deepEqual(satAdd([200, 200, 200], [100, 50, 0]), [255, 250, 200]);
});
