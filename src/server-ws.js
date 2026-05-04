import { WebSocketServer } from 'ws';
import { Buffer } from 'node:buffer';
import { parseClientMessage } from './protocol.js';
import { log } from './log.js';

export function createWsLayer({ httpServer, runner, wledStore }) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Set();

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const c of clients) {
      if (c.readyState === 1) c.send(data);
    }
  }

  function helloFor() {
    return {
      type: 'hello',
      wleds: wledStore.list().map(w => ({
        id: w.id, name: w.name || w.host, host: w.host,
        ledCount: w.ledCount, online: w.online,
      })),
    };
  }

  function broadcastHello() { broadcast(helloFor()); }

  function broadcastFrame(rgbBuf) {
    if (!rgbBuf) return;
    let cached = null;
    for (const c of clients) {
      if (c.readyState === 1 && c.wantsPreview) {
        if (cached === null) {
          const b64 = Buffer.from(rgbBuf.buffer, rgbBuf.byteOffset, rgbBuf.byteLength).toString('base64');
          cached = JSON.stringify({ type: 'frame', rgb: b64, n: rgbBuf.length / 3 });
        }
        c.send(cached);
      }
    }
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.wantsPreview = false;
    ws.send(JSON.stringify(helloFor()));
    ws.send(JSON.stringify(runner.snapshot()));
    wledStore.maybeReprobe?.().catch(() => {});

    ws.on('message', async (raw) => {
      let m;
      try { m = parseClientMessage(raw.toString()); }
      catch (e) {
        ws.send(JSON.stringify({ type: 'error', reason: 'bad_message', details: String(e.message || e) }));
        return;
      }
      try {
        if (m.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (m.type === 'shoot') {
          runner.shoot(m.color);
        } else if (m.type === 'brightness') {
          runner.setBrightness(m.value);
        } else if (m.type === 'start') {
          const r = await runner.start(m);
          if (!r.ok) {
            ws.send(JSON.stringify({ type: 'error', reason: r.reason, retryInMs: r.retryInMs }));
          }
        } else if (m.type === 'hello') {
          ws.send(JSON.stringify(helloFor()));
          wledStore.maybeReprobe?.().catch(() => {});
        } else if (m.type === 'preview') {
          ws.wantsPreview = m.enabled;
        }
      } catch (e) {
        log.error('ws handler error', { error: String(e.message || e) });
        ws.send(JSON.stringify({ type: 'error', reason: 'internal' }));
      }
    });

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  return { broadcast, broadcastFrame, helloFor, broadcastHello };
}
