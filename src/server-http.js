import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

export function createHttpHandler({ publicDir, getApiState, getApiWleds }) {
  return function handler(req, res) {
    if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
    const url = req.url || '/';
    if (url === '/healthz') { res.end('OK'); return; }
    if (url === '/api/state') {
      res.setHeader('content-type', TYPES['.json']);
      res.end(JSON.stringify(getApiState()));
      return;
    }
    if (url === '/api/wleds') {
      res.setHeader('content-type', TYPES['.json']);
      res.end(JSON.stringify(getApiWleds()));
      return;
    }
    let p = url === '/' ? '/index.html' : url;
    p = p.split('?')[0].split('#')[0];
    p = normalize(p).replace(/^[\\/]+/, '');
    if (p.includes('..')) { res.statusCode = 400; res.end(); return; }
    const full = join(publicDir, p);
    if (!existsSync(full) || !statSync(full).isFile()) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', TYPES[extname(full)] || 'application/octet-stream');
    res.end(readFileSync(full));
  };
}

export function listenWalking(server, start, max) {
  return new Promise((resolve, reject) => {
    let p = start;
    function tryOnce() {
      server.removeAllListeners('error');
      server.removeAllListeners('listening');
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && p < max) { p++; tryOnce(); }
        else reject(err);
      });
      server.once('listening', () => resolve(p));
      server.listen(p, '0.0.0.0');
    }
    tryOnce();
  });
}
