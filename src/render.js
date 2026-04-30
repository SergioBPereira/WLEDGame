import { parseHex } from './color.js';

export function newFrame(ledCount) {
  return new Uint8Array(ledCount * 3);
}

export function renderBackground(frame, bg, ledCount, fireZoneLeds, t, renderCfg) {
  if (!bg || bg.mode === 'off') return;
  const [r, g, b] = parseHex(bg.color);
  let mul = renderCfg.backgroundBrightness;
  if (bg.mode === 'breathe') {
    mul *= 0.7 + 0.3 * Math.sin(t * 0.6);
  }
  const lastNonFire = ledCount - fireZoneLeds;
  for (let i = 0; i < lastNonFire; i++) {
    frame[i*3 + 0] = Math.floor(r * mul);
    frame[i*3 + 1] = Math.floor(g * mul);
    frame[i*3 + 2] = Math.floor(b * mul);
  }
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

export function renderFireZone(frame, ledCount, fireZoneLeds, t) {
  const start = ledCount - fireZoneLeds;
  for (let i = start; i < ledCount; i++) {
    const relIdx = i - start;
    let heat = 0.65 + 0.20 * Math.sin(t * 1.8 + relIdx * 0.7)
                    + 0.10 * Math.sin(t * 5.3 + relIdx * 1.9);
    heat = clamp01(heat);
    heat *= 1.0 - relIdx / (2 * fireZoneLeds);
    const h2 = heat * heat;
    const h3 = h2 * heat;
    frame[i*3 + 0] = Math.min(255, Math.floor(255 * heat));
    frame[i*3 + 1] = Math.min(255, Math.floor(180 * h2));
    frame[i*3 + 2] = Math.min(255, Math.floor(40 * h3));
  }
}
