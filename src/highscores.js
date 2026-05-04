// Per-(WLED + setup-key) best score, persisted to highscores.json under the state dir.
//
// Setup key folds the gameplay-affecting options into one string so two rounds
// played with the same WLED but different mode/kids/wEnemies/endless are scored
// independently. Background and brightness do NOT change difficulty, so they
// don't enter the key.
//
// File shape:
//   { entries: { "<key>": { score, ts } } }
//
// Tiny by design: top-1 per key. Per-WLED top-10 is item D's stretch goal —
// punt until someone asks.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FILE = 'highscores.json';

export function setupKey({ wledId, wrongColorMode, kidsMode, wEnemies, endless }) {
  return [
    wledId,
    wrongColorMode,
    kidsMode ? 'kids' : 'std',
    wEnemies ? 'wEn' : 'wOff',
    endless ? 'endless' : 'campaign',
  ].join('|');
}

export function loadHighscores(stateDir) {
  try {
    const p = join(stateDir, FILE);
    if (!existsSync(p)) return { entries: {} };
    const raw = readFileSync(p, 'utf8');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || typeof obj.entries !== 'object') {
      return { entries: {} };
    }
    return { entries: { ...obj.entries } };
  } catch {
    return { entries: {} };
  }
}

export function saveHighscores(stateDir, hs) {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, FILE), JSON.stringify(hs));
}

// Returns { changed, prev, current } so the caller can decide whether to
// broadcast a "new best" event. Insert is a no-op when score does not exceed
// the existing best — ties are not promoted (you have to actually beat it).
export function recordScore(hs, key, score, now = Date.now()) {
  const prev = hs.entries[key] ?? null;
  if (prev && score <= prev.score) return { changed: false, prev, current: prev };
  const current = { score, ts: now };
  hs.entries[key] = current;
  return { changed: true, prev, current };
}

export function getBest(hs, key) { return hs.entries[key] ?? null; }
