import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import dgram from 'node:dgram';
import { WebSocket } from 'ws';

import { loadConfig } from '../src/config.js';
import { createWledStore } from '../src/wled-store.js';
import { createSender } from '../src/wled-udp.js';
import { createGameRunner } from '../src/game-runner.js';
import { createHttpHandler, listenWalking } from '../src/server-http.js';
import { createWsLayer } from '../src/server-ws.js';

function startFakeWled() {
  return new Promise((resolve) => {
    const httpSrv = http.createServer((req, res) => {
      if (req.url === '/json/info') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ name: 'FakeStrip', leds: { count: 30 }, ver: 'fake', udpport: 0 }));
      } else if (req.url === '/json/state') {
        if (req.method === 'GET') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ on: true, bri: 100 }));
        } else {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', () => res.end(JSON.stringify({ success: true })));
        }
      } else { res.statusCode = 404; res.end(); }
    });
    const udpSock = dgram.createSocket('udp4');
    const udpFrames = [];
    udpSock.on('message', buf => udpFrames.push(buf));
    httpSrv.listen(0, '127.0.0.1', () => {
      udpSock.bind(0, '127.0.0.1', () => {
        resolve({
          host: '127.0.0.1',
          httpPort: httpSrv.address().port,
          udpPort: udpSock.address().port,
          udpFrames,
          stop: () => { httpSrv.close(); udpSock.close(); },
        });
      });
    });
  });
}

test('end-to-end: round produces UDP frames and state broadcasts', async () => {
  const fake = await startFakeWled();
  try {
    const cfg = loadConfig('./config.json');
    cfg.stateDir = '/tmp/wlsmoke-' + Date.now();
    cfg.targetFps = 60;

    const wledStore = createWledStore({
      wleds: [{ id: 'fake', host: fake.host, httpPort: fake.httpPort, udpPort: fake.udpPort, name: 'FakeStrip' }],
      stateDir: cfg.stateDir,
    });
    await wledStore.recoverFromCrash();
    await wledStore.probeAll(2000);

    const sender = createSender();
    let wsLayer = null;
    const runner = createGameRunner({
      cfg, wledStore, sender,
      broadcast: msg => wsLayer?.broadcast(msg),
    });
    const handler = createHttpHandler({
      publicDir: './public',
      getApiState: () => runner.snapshot(),
      getApiWleds: () => wledStore.list(),
    });
    const httpSrv = http.createServer(handler);
    wsLayer = createWsLayer({ httpServer: httpSrv, runner, wledStore });
    const port = await listenWalking(httpSrv, 18080, 18099);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages = [];
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    ws.on('message', d => messages.push(JSON.parse(d.toString())));

    ws.send(JSON.stringify({
      type: 'start',
      wledId: 'fake',
      wrongColorMode: 'consumed',
      kidsMode: false,
      background: { mode: 'off' },
    }));

    await new Promise(r => setTimeout(r, 500));

    ws.close();
    await runner.shutdown();
    sender.close();
    httpSrv.close();

    assert.ok(fake.udpFrames.length > 5, `got ${fake.udpFrames.length} frames`);
    assert.equal(fake.udpFrames[0][0], 0x02);
    assert.equal(fake.udpFrames[0][1], 0x01);

    const states = messages.filter(m => m.type === 'state');
    assert.ok(states.some(s => s.phase === 'playing'));
  } finally {
    fake.stop();
  }
});
