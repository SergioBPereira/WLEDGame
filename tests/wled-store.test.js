import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWledStore } from '../src/wled-store.js';

function fakeWled(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function makeStore(wleds) {
  const stateDir = mkdtempSync(join(tmpdir(), 'wled-store-'));
  return createWledStore({ wleds, stateDir });
}

test('maybeReprobe is no-op when all wleds online', async () => {
  const { server, port } = await fakeWled((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ name: 'A', leds: { count: 60 } }));
  });
  try {
    const store = makeStore([{ id: 'a', host: '127.0.0.1', httpPort: port }]);
    await store.probeAll();
    assert.equal(store.get('a').online, true);
    const r = await store.maybeReprobe();
    assert.equal(r.ran, false);
  } finally { server.close(); }
});

test('maybeReprobe brings offline wled back online and fires onChange', async () => {
  let respond = false;
  const { server, port } = await fakeWled((req, res) => {
    if (!respond) {
      // simulate timeout: never reply
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ name: 'B', leds: { count: 90 } }));
  });
  try {
    const store = makeStore([{ id: 'b', host: '127.0.0.1', httpPort: port }]);
    await store.probeAll(150);
    assert.equal(store.get('b').online, false);

    let changeCalls = 0;
    store.setOnChange(() => { changeCalls++; });

    respond = true;
    const r = await store.maybeReprobe({ minIntervalMs: 0, timeoutMs: 1000 });
    assert.equal(r.ran, true);
    assert.equal(r.changed, true);
    assert.equal(store.get('b').online, true);
    assert.equal(changeCalls, 1);
  } finally { server.close(); }
});

test('maybeReprobe debounces within minIntervalMs', async () => {
  let calls = 0;
  const { server, port } = await fakeWled((req, res) => {
    calls++;
    // hang to keep them offline
  });
  try {
    const store = makeStore([{ id: 'c', host: '127.0.0.1', httpPort: port }]);
    await store.probeAll(100);
    assert.equal(store.get('c').online, false);
    const callsAfterInitial = calls;

    // First reprobe runs and finishes (timeout).
    await store.maybeReprobe({ minIntervalMs: 60_000, timeoutMs: 100 });
    const callsAfterFirst = calls;
    assert.ok(callsAfterFirst > callsAfterInitial, 'first reprobe should issue a request');

    // Second reprobe within debounce window must not issue a new request.
    const r = await store.maybeReprobe({ minIntervalMs: 60_000, timeoutMs: 100 });
    assert.equal(r.ran, false);
    assert.equal(calls, callsAfterFirst);
  } finally { server.close(); }
});

test('maybeReprobe coalesces concurrent calls', async () => {
  let calls = 0;
  const { server, port } = await fakeWled((req, res) => {
    calls++;
    setTimeout(() => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ name: 'D', leds: { count: 60 } }));
    }, 50);
  });
  try {
    const store = makeStore([{ id: 'd', host: '127.0.0.1', httpPort: port }]);
    await store.probeAll(20); // force offline via timeout
    assert.equal(store.get('d').online, false);
    calls = 0;

    const [r1, r2, r3] = await Promise.all([
      store.maybeReprobe({ minIntervalMs: 0, timeoutMs: 500 }),
      store.maybeReprobe({ minIntervalMs: 0, timeoutMs: 500 }),
      store.maybeReprobe({ minIntervalMs: 0, timeoutMs: 500 }),
    ]);
    // All three resolve to the same in-flight result; only one HTTP probe issued.
    assert.equal(calls, 1);
    assert.equal(r1.ran, true);
    assert.equal(r2.ran, true);
    assert.equal(r3.ran, true);
  } finally { server.close(); }
});
