import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { probeInfo, getState, postState } from '../src/wled-http.js';

function withFakeWled(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      try {
        await fn({ host: '127.0.0.1', port });
        server.close(resolve);
      } catch (e) {
        server.close(() => reject(e));
      }
    });
  });
}

test('probeInfo returns name + ledCount', async () => {
  await withFakeWled((req, res) => {
    if (req.url === '/json/info') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ name: 'TestStrip', leds: { count: 60 }, ver: '0.14.0' }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  }, async ({ host, port }) => {
    const info = await probeInfo({ host, httpPort: port }, 1000);
    assert.equal(info.name, 'TestStrip');
    assert.equal(info.ledCount, 60);
  });
});

test('probeInfo throws on timeout', async () => {
  await withFakeWled((req, res) => {
    // never respond
  }, async ({ host, port }) => {
    await assert.rejects(
      () => probeInfo({ host, httpPort: port }, 100),
      /timeout/
    );
  });
});

test('getState + postState round-trip', async () => {
  let captured = null;
  await withFakeWled((req, res) => {
    if (req.method === 'GET' && req.url === '/json/state') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ on: true, bri: 128, seg: [{ id: 0 }] }));
    } else if (req.method === 'POST' && req.url === '/json/state') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        captured = JSON.parse(body);
        res.end(JSON.stringify({ success: true }));
      });
    } else {
      res.statusCode = 404;
      res.end();
    }
  }, async ({ host, port }) => {
    const state = await getState({ host, httpPort: port }, 1000);
    assert.equal(state.on, true);
    assert.equal(state.bri, 128);
    await postState({ host, httpPort: port }, state, 1000);
    assert.deepEqual(captured, state);
  });
});
