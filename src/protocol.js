const VALID_COLORS = new Set(['R', 'G', 'B']);
const VALID_MODES = new Set(['consumed', 'stuck']);
const VALID_BG_MODES = new Set(['off', 'solid', 'breathe']);

function bad(msg) { throw new Error(`bad message: ${msg}`); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function parseClientMessage(raw) {
  let m;
  try { m = JSON.parse(raw); }
  catch { bad('not json'); }
  if (!m || typeof m.type !== 'string') bad('no type');

  switch (m.type) {
    case 'hello':
    case 'ping':
      return { type: m.type };
    case 'shoot':
      if (!VALID_COLORS.has(m.color)) bad('shoot.color');
      return { type: 'shoot', color: m.color };
    case 'brightness': {
      const v = Number(m.value);
      if (!Number.isFinite(v)) bad('brightness.value');
      return { type: 'brightness', value: clamp(Math.round(v), 0, 100) };
    }
    case 'start': {
      if (typeof m.wledId !== 'string' || !m.wledId) bad('start.wledId');
      if (!VALID_MODES.has(m.wrongColorMode)) bad('start.wrongColorMode');
      const kidsMode = !!m.kidsMode;
      const bg = m.background || { mode: 'off' };
      if (!VALID_BG_MODES.has(bg.mode)) bad('start.background.mode');
      if (bg.mode !== 'off') {
        if (typeof bg.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(bg.color)) bad('start.background.color');
      }
      return { type: 'start', wledId: m.wledId, wrongColorMode: m.wrongColorMode, kidsMode, background: bg };
    }
    default:
      bad(`unknown type ${m.type}`);
  }
}
