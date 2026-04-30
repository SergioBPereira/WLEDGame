import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, loadWleds } from '../src/config.js';

test('loadConfig returns parsed object with required keys', () => {
  const cfg = loadConfig('./config.json');
  assert.equal(typeof cfg.httpPort, 'number');
  assert.equal(typeof cfg.targetFps, 'number');
  assert.equal(typeof cfg.game.spawnBaseMs, 'number');
  assert.equal(typeof cfg.render.backgroundBrightness, 'number');
});

test('loadWleds applies defaults: id from host octet, ports', () => {
  // Use the example file in tests so this works on a fresh checkout.
  const list = loadWleds('./wleds.example.json');
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
  for (const w of list) {
    assert.equal(typeof w.host, 'string');
    assert.equal(typeof w.id, 'string');
    assert.equal(w.udpPort, 21324);
    assert.equal(w.httpPort, 80);
  }
  assert.match(list[0].id, /^wled-\d+$/);
});
