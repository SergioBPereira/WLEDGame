import { readFileSync } from 'node:fs';

export function loadConfig(path) {
  const raw = readFileSync(path, 'utf8');
  const cfg = JSON.parse(raw);
  for (const k of ['httpPort', 'fireZoneLeds', 'targetFps', 'game', 'render']) {
    if (cfg[k] === undefined) throw new Error(`config: missing ${k}`);
  }
  return cfg;
}

function idFromHost(host) {
  const parts = host.split('.');
  return `wled-${parts[parts.length - 1]}`;
}

export function loadWleds(path) {
  const raw = readFileSync(path, 'utf8');
  const obj = JSON.parse(raw);
  if (!Array.isArray(obj.wleds)) throw new Error('wleds.json: missing "wleds" array');
  return obj.wleds.map(entry => {
    if (!entry.host) throw new Error('wleds.json: each entry requires "host"');
    return {
      id: entry.id || idFromHost(entry.host),
      name: entry.name || null,
      host: entry.host,
      udpPort: entry.udpPort || 21324,
      httpPort: entry.httpPort || 80,
    };
  });
}
