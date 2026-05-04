import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FILE = 'progression.json';
const DEFAULTS = { endlessUnlocked: false };

export function loadProgression(stateDir) {
  try {
    const p = join(stateDir, FILE);
    if (!existsSync(p)) return { ...DEFAULTS };
    const raw = readFileSync(p, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveProgression(stateDir, progression) {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, FILE), JSON.stringify(progression));
}
