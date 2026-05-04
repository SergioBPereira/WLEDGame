import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHighWaterMark, renderTunnels, isInTunnel, renderFrame } from '../src/render.js';
import { parseHex } from '../src/color.js';

function emptyFrame(n) { return new Uint8Array(n * 3); }

test('renderHighWaterMark places a dim tick at the right physical LED', () => {
  const f = emptyFrame(100);
  // virtualPos = 500 → LED 50.
  renderHighWaterMark(f, 500, 100, 4);
  // LED 50 should have non-zero RGB; neighbours zero.
  assert.ok(f[50*3] > 0 || f[50*3+1] > 0 || f[50*3+2] > 0, 'expected HWM tint at LED 50');
  assert.equal(f[49*3] + f[49*3+1] + f[49*3+2], 0);
  assert.equal(f[51*3] + f[51*3+1] + f[51*3+2], 0);
});

test('renderHighWaterMark is no-op for null/zero deepest', () => {
  const f = emptyFrame(100);
  renderHighWaterMark(f, 0, 100, 4);
  renderHighWaterMark(f, null, 100, 4);
  for (const v of f) assert.equal(v, 0);
});

test('renderHighWaterMark never paints into the fire zone', () => {
  const f = emptyFrame(100);
  // virtualPos near 1000 → would land in fire zone, but renderer clamps to lastNonFire-1.
  renderHighWaterMark(f, 990, 100, 4);
  const i = 100 - 4 - 1; // 95
  assert.ok(f[i*3] + f[i*3+1] + f[i*3+2] > 0);
});

test('renderTunnels paints fixed dim color and clamps to non-fire zone', () => {
  const f = emptyFrame(100);
  const tunnels = [{ startLed: 90, endLed: 200, color: '#ff0000', brightness: 0.5, _rgb: parseHex('#ff0000') }];
  renderTunnels(f, tunnels, 100, 4);
  // ledCount=100, fireZoneLeds=4 → lastNonFire=96, so end clamped to 95.
  for (let i = 90; i <= 95; i++) {
    assert.equal(f[i*3], Math.floor(255 * 0.5));
    assert.equal(f[i*3+1], 0);
    assert.equal(f[i*3+2], 0);
  }
  // Fire zone untouched by tunnel:
  for (let i = 96; i < 100; i++) assert.equal(f[i*3] + f[i*3+1] + f[i*3+2], 0);
});

test('isInTunnel matches when virtual position resolves into a tunnel range', () => {
  const tunnels = [{ startLed: 20, endLed: 30 }];
  // virtual 250 with 100 LEDs → LED 25 (in tunnel)
  assert.equal(isInTunnel(250, tunnels, 100), true);
  // virtual 100 → LED 10 (not in tunnel)
  assert.equal(isInTunnel(100, tunnels, 100), false);
});

test('renderFrame: tunnel paints over entity LED (occlusion)', () => {
  const cfg = {
    fireZoneLeds: 4,
    render: {
      backgroundBrightness: 0,
      leadEmphasisBaseW: 0, leadEmphasisAmpW: 0,
      leadEmphasisHzAtSpawn: 0, leadEmphasisHzAtFire: 0,
    },
  };
  const tunnels = [{ startLed: 50, endLed: 55, color: '#001122', brightness: 0.5, _rgb: parseHex('#001122') }];
  // Entity at virtual 525 → LED 52 (in tunnel range).
  const entities = [{ id: 'e:0', pos: 525, rgb: [255, 255, 255] }];
  const frame = renderFrame({
    ledCount: 100, t: 0, background: { mode: 'off' }, entities,
    leadId: null, brightness: 100, cfg, tunnels,
  });
  // LED 52 should match the tunnel color (not pure white from the entity).
  const r = frame[52*3], g = frame[52*3+1], b = frame[52*3+2];
  assert.ok(r < 50 && b > 5, `expected tunnel tint at LED 52, got ${r},${g},${b}`);
});
