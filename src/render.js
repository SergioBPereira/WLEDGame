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
