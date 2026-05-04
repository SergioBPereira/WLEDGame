import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { probeInfo, getState, postState } from './wled-http.js';
import { log } from './log.js';

export function createWledStore({ wleds, stateDir }) {
  const byId = new Map();
  for (const w of wleds) {
    byId.set(w.id, { ...w, name: w.name ?? null, ledCount: null, online: false });
  }

  async function ensureStateDir() {
    if (!existsSync(stateDir)) await mkdir(stateDir, { recursive: true });
  }

  async function probeOne(w, timeoutMs) {
    try {
      const info = await probeInfo(w, timeoutMs);
      w.name = w.name || info.name;
      w.ledCount = info.ledCount;
      w.udpPort = info.udpPort || w.udpPort;
      w.online = true;
      log.info('wled probed', { id: w.id, name: w.name, leds: w.ledCount });
    } catch (err) {
      w.online = false;
      w.lastError = String(err.message || err);
      log.warn('wled probe failed', { id: w.id, error: w.lastError });
    }
  }

  async function probeAll(timeoutMs = 1500) {
    await Promise.allSettled([...byId.values()].map(w => probeOne(w, timeoutMs)));
  }

  let lastReprobeAt = 0;
  let inFlightReprobe = null;
  let onChange = null;
  function setOnChange(fn) { onChange = fn; }

  function maybeReprobe({ minIntervalMs = 10000, timeoutMs = 1500 } = {}) {
    if (inFlightReprobe) return inFlightReprobe;
    const offline = [...byId.values()].filter(w => !w.online);
    if (offline.length === 0) return Promise.resolve({ ran: false, changed: false });
    const now = Date.now();
    if (now - lastReprobeAt < minIntervalMs) return Promise.resolve({ ran: false, changed: false });
    lastReprobeAt = now;
    log.info('reprobing offline wleds', { ids: offline.map(w => w.id) });
    inFlightReprobe = (async () => {
      await Promise.allSettled(offline.map(w => probeOne(w, timeoutMs)));
      const changed = offline.some(w => w.online);
      inFlightReprobe = null;
      if (changed && onChange) {
        try { onChange(); } catch (e) { log.warn('onChange handler error', { error: String(e.message || e) }); }
      }
      return { ran: true, changed };
    })();
    return inFlightReprobe;
  }

  async function recoverFromCrash() {
    await ensureStateDir();
    const files = (await readdir(stateDir)).filter(f =>
      f.startsWith('last-state-') && f.endsWith('.json'));
    for (const file of files) {
      const id = file.replace(/^last-state-/, '').replace(/\.json$/, '');
      const w = byId.get(id);
      if (!w) {
        log.warn('crash recovery: orphaned state file', { id });
        await unlink(join(stateDir, file)).catch(() => {});
        continue;
      }
      try {
        const raw = await readFile(join(stateDir, file), 'utf8');
        const saved = JSON.parse(raw);
        await postState(w, saved, 2000);
        await unlink(join(stateDir, file));
        log.info('crash recovery: restored', { id });
      } catch (e) {
        log.warn('crash recovery failed', { id, error: String(e.message || e) });
      }
    }
  }

  async function saveStateFor(id) {
    const w = byId.get(id);
    if (!w) throw new Error(`unknown wled id: ${id}`);
    const state = await getState(w, 2000);
    w.savedState = state;
    await ensureStateDir();
    await writeFile(join(stateDir, `last-state-${id}.json`), JSON.stringify(state));
    return state;
  }

  async function restoreStateFor(id) {
    const w = byId.get(id);
    if (!w || !w.savedState) return;
    try {
      await postState(w, w.savedState, 2000);
      await unlink(join(stateDir, `last-state-${id}.json`)).catch(() => {});
      w.savedState = null;
    } catch (e) {
      log.warn('restore failed', { id, error: String(e.message || e) });
    }
  }

  function get(id) { return byId.get(id); }
  function list() { return [...byId.values()]; }

  return { probeAll, maybeReprobe, setOnChange, recoverFromCrash, saveStateFor, restoreStateFor, get, list };
}
