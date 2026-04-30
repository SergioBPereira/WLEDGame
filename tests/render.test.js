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

import { renderFireZone } from '../src/render.js';
import { renderEntity } from '../src/render.js';

test('entity at integer virtual position lights one LED fully', () => {
  const ledCount = 100;
  const f = newFrame(ledCount);
  renderEntity(f, 100.0, [255, 0, 0], ledCount, false, 0, {});
  assert.equal(f[10*3 + 0], 255);
  assert.equal(f[9*3 + 0], 0);
  assert.equal(f[11*3 + 0], 0);
});

test('entity at fractional position splits between two LEDs', () => {
  const ledCount = 100;
  const f = newFrame(ledCount);
  renderEntity(f, 105.0, [200, 0, 0], ledCount, false, 0, {});
  assert.equal(f[10*3 + 0], Math.floor(200 * 0.5));
  assert.equal(f[11*3 + 0], Math.floor(200 * 0.5));
});

test('entity overwrites prior framebuffer value', () => {
  const ledCount = 10;
  const f = newFrame(ledCount);
  f[5*3 + 0] = 50;
  renderEntity(f, 500.0, [200, 0, 0], ledCount, false, 0, {});
  assert.equal(f[5*3 + 0], 200);
});

test('fire zone writes non-zero R into last fireZoneLeds positions', () => {
  const ledCount = 20, fireZone = 4;
  const f = newFrame(ledCount);
  renderFireZone(f, ledCount, fireZone, 1.234);
  for (let i = 0; i < ledCount - fireZone; i++) {
    assert.equal(f[i*3 + 0], 0);
  }
  let anyR = false;
  for (let i = ledCount - fireZone; i < ledCount; i++) {
    if (f[i*3 + 0] > 0) anyR = true;
  }
  assert.ok(anyR);
});

test('fire zone palette: R >= G >= B per LED', () => {
  const ledCount = 10, fireZone = 4;
  const f = newFrame(ledCount);
  renderFireZone(f, ledCount, fireZone, 0.5);
  for (let i = ledCount - fireZone; i < ledCount; i++) {
    const [r, g, b] = [f[i*3], f[i*3+1], f[i*3+2]];
    assert.ok(r >= g, `R(${r}) >= G(${g}) at led ${i}`);
    assert.ok(g >= b, `G(${g}) >= B(${b}) at led ${i}`);
  }
});
