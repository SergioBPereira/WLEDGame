import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig, loadWleds } from './src/config.js';
import { log, setLevel } from './src/log.js';
import { createWledStore } from './src/wled-store.js';
import { createSender } from './src/wled-udp.js';
import { createGameRunner } from './src/game-runner.js';
import { createHttpHandler, listenWalking } from './src/server-http.js';
import { createWsLayer } from './src/server-ws.js';

const ROOT = dirname(fileURLToPath(import.meta.url));

async function main() {
  const cfg = loadConfig(join(ROOT, 'config.json'));
  const wleds = loadWleds(join(ROOT, 'wleds.json'));
  setLevel(cfg.logLevel || 'info');

  const wledStore = createWledStore({ wleds, stateDir: cfg.stateDir });
  await wledStore.recoverFromCrash();
  wledStore.probeAll().catch(e => log.warn('probeAll error', { error: String(e) }));

  const sender = createSender();

  let wsLayer = null;
  const runner = createGameRunner({
    cfg, wledStore, sender,
    broadcast: (msg) => wsLayer?.broadcast(msg),
    broadcastFrame: (rgb) => wsLayer?.broadcastFrame(rgb),
  });

  const handler = createHttpHandler({
    publicDir: join(ROOT, 'public'),
    getApiState: () => runner.snapshot(),
    getApiWleds: () => wledStore.list().map(w => ({
      id: w.id, name: w.name || w.host, host: w.host, ledCount: w.ledCount, online: w.online,
    })),
  });
  const httpServer = http.createServer(handler);

  wsLayer = createWsLayer({ httpServer, runner, wledStore });

  const port = await listenWalking(httpServer, cfg.httpPort, cfg.httpPortMaxWalk);
  log.info('http+ws listening', { port });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutting down', { signal });
    const t = setTimeout(() => process.exit(1), 3000);
    try {
      await runner.shutdown();
      sender.close();
      httpServer.close();
    } finally {
      clearTimeout(t);
      process.exit(0);
    }
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(e => {
  console.error('fatal', e);
  process.exit(1);
});
