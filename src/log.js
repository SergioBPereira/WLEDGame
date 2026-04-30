const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

let currentLevel = LEVELS.info;

export function setLevel(name) {
  if (LEVELS[name] === undefined) throw new Error(`unknown log level: ${name}`);
  currentLevel = LEVELS[name];
}

function fmt(level, msg, kv) {
  const ts = new Date().toISOString();
  let line = `[${ts}] [${level}] ${msg}`;
  if (kv) {
    for (const [k, v] of Object.entries(kv)) {
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      line += ` ${k}=${s}`;
    }
  }
  return line;
}

function emit(level, msg, kv) {
  if (LEVELS[level] > currentLevel) return;
  const line = fmt(level, msg, kv);
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const log = {
  error: (msg, kv) => emit('error', msg, kv),
  warn:  (msg, kv) => emit('warn',  msg, kv),
  info:  (msg, kv) => emit('info',  msg, kv),
  debug: (msg, kv) => emit('debug', msg, kv),
};
