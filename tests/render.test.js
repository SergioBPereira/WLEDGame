import test from 'node:test';
import assert from 'node:assert/strict';
import { newFrame, renderBackground } from '../src/render.js';

test('newFrame allocates Uint8Array of ledCount*3 zeros', () => {
  const f = newFrame(60);
  assert.equal(f.length, 180);
  for (const v of f) assert.equal(v, 0);
});

test('background "off" leaves frame unchanged', () => {
  const f = newFrame(10);
  renderBackground(f, { mode: 'off' }, 10, 4, 0, { backgroundBrightness: 0.15 });
  for (const v of f) assert.equal(v, 0);
});

test('background "solid" fills non-fire LEDs at 15% color', () => {
  const f = newFrame(10);
  renderBackground(f, { mode: 'solid', color: '#ff0000' }, 10, 4, 0, { backgroundBrightness: 0.15 });
  for (let i = 0; i < 6; i++) {
    assert.equal(f[i*3 + 0], Math.floor(255 * 0.15));
    assert.equal(f[i*3 + 1], 0);
    assert.equal(f[i*3 + 2], 0);
  }
  for (let i = 6; i < 10; i++) {
    assert.equal(f[i*3 + 0], 0);
    assert.equal(f[i*3 + 1], 0);
    assert.equal(f[i*3 + 2], 0);
  }
});

test('background "breathe" modulates by sin(t*0.6)', () => {
  const f = newFrame(10);
  renderBackground(f, { mode: 'breathe', color: '#00ff00' }, 10, 4, 0, { backgroundBrightness: 0.15 });
  const expected = Math.floor(255 * 0.15 * 0.7);
  for (let i = 0; i < 6; i++) {
    assert.equal(f[i*3 + 1], expected);
  }
});
