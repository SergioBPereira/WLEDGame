import { readFileSync } from 'node:fs';
import { parseHex } from './color.js';

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

function parseTunnels(rawTunnels, hostLabel) {
  if (rawTunnels == null) return [];
  if (!Array.isArray(rawTunnels)) {
    throw new Error(`wleds.json[${hostLabel}].tunnels must be an array`);
  }
  return rawTunnels.map((t, i) => {
    const startLed = Number(t.startLed);
    const endLed   = Number(t.endLed);
    if (!Number.isInteger(startLed) || !Number.isInteger(endLed) || startLed < 0 || endLed < startLed) {
      throw new Error(`wleds.json[${hostLabel}].tunnels[${i}] needs integer startLed ≤ endLed`);
    }
    const color = t.color ?? '#222244';
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new Error(`wleds.json[${hostLabel}].tunnels[${i}].color must be #RRGGBB`);
    }
    const brightness = t.brightness == null ? 0.10 : Number(t.brightness);
    if (!Number.isFinite(brightness) || brightness < 0 || brightness > 1) {
      throw new Error(`wleds.json[${hostLabel}].tunnels[${i}].brightness must be in [0,1]`);
    }
    return { startLed, endLed, color, brightness, _rgb: parseHex(color) };
  });
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
      tunnels: parseTunnels(entry.tunnels, entry.host),
    };
  });
}
