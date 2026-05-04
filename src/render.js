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

export function renderEntity(frame, virtualPos, baseRgb, ledCount, isLead, t, renderCfg) {
  const physF = virtualPos * ledCount / 1000;
  const i0 = Math.floor(physF);
  const frac = physF - i0;
  const i1 = Math.min(i0 + 1, ledCount - 1);

  let rgb = baseRgb;
  if (isLead && renderCfg.leadEmphasisBaseW !== undefined) {
    const pulseHz = renderCfg.leadEmphasisHzAtSpawn
      + (renderCfg.leadEmphasisHzAtFire - renderCfg.leadEmphasisHzAtSpawn) * (virtualPos / 1000);
    const w = renderCfg.leadEmphasisBaseW
      + renderCfg.leadEmphasisAmpW * Math.sin(2 * Math.PI * pulseHz * t);
    const ww = Math.max(0, Math.min(1, w));
    rgb = [
      Math.floor(rgb[0] + ww * (255 - rgb[0])),
      Math.floor(rgb[1] + ww * (255 - rgb[1])),
      Math.floor(rgb[2] + ww * (255 - rgb[2])),
    ];
  }

  if (i0 >= 0 && i0 < ledCount) {
    const w0 = 1 - frac;
    frame[i0*3 + 0] = Math.floor(rgb[0] * w0);
    frame[i0*3 + 1] = Math.floor(rgb[1] * w0);
    frame[i0*3 + 2] = Math.floor(rgb[2] * w0);
  }
  if (i1 !== i0 && i1 >= 0 && i1 < ledCount) {
    const w1 = frac;
    frame[i1*3 + 0] = Math.floor(rgb[0] * w1);
    frame[i1*3 + 1] = Math.floor(rgb[1] * w1);
    frame[i1*3 + 2] = Math.floor(rgb[2] * w1);
  }
}

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

// Subtle high-water-mark of how far any enemy got this round.
// Renders as a tiny dim cool-white tick so it doesn't compete with live entities.
export function renderHighWaterMark(frame, virtualPos, ledCount, fireZoneLeds) {
  if (virtualPos == null || virtualPos <= 0) return;
  const lastNonFire = ledCount - fireZoneLeds;
  const physF = virtualPos * ledCount / 1000;
  const i = Math.min(lastNonFire - 1, Math.max(0, Math.floor(physF)));
  // Cool dim white — additive so it shows on dark and tints on top of background.
  const r = 28, g = 36, b = 50;
  frame[i*3 + 0] = Math.min(255, frame[i*3 + 0] + r);
  frame[i*3 + 1] = Math.min(255, frame[i*3 + 1] + g);
  frame[i*3 + 2] = Math.min(255, frame[i*3 + 2] + b);
}

// Tunnels: per-WLED occlusion regions configured in wleds.json.
// Each tunnel paints a fixed dim color over its LEDs and is rendered AFTER
// entities so it covers them visually (entities still exist + collide).
export function renderTunnels(frame, tunnels, ledCount, fireZoneLeds) {
  if (!tunnels || tunnels.length === 0) return;
  const lastNonFire = ledCount - fireZoneLeds;
  for (const t of tunnels) {
    const start = Math.max(0, t.startLed);
    const end   = Math.min(lastNonFire - 1, t.endLed); // never overlap fire zone
    const [r, g, b] = t._rgb; // pre-parsed
    const mul = t.brightness ?? 0.10;
    for (let i = start; i <= end; i++) {
      frame[i*3 + 0] = Math.floor(r * mul);
      frame[i*3 + 1] = Math.floor(g * mul);
      frame[i*3 + 2] = Math.floor(b * mul);
    }
  }
}

export function isInTunnel(virtualPos, tunnels, ledCount) {
  if (!tunnels || tunnels.length === 0) return false;
  const physF = virtualPos * ledCount / 1000;
  const i = Math.floor(physF);
  for (const t of tunnels) if (i >= t.startLed && i <= t.endLed) return true;
  return false;
}

export function applyBrightness(frame, value0to100) {
  const k = value0to100 / 100;
  for (let i = 0; i < frame.length; i++) {
    frame[i] = Math.floor(frame[i] * k);
  }
}

export function renderFrame({ ledCount, t, background, entities, leadId, brightness, cfg, deepestPos, tunnels }) {
  const frame = newFrame(ledCount);
  const fireZoneLeds = cfg.fireZoneLeds;
  renderBackground(frame, background, ledCount, fireZoneLeds, t, cfg.render);
  renderHighWaterMark(frame, deepestPos, ledCount, fireZoneLeds);
  renderFireZone(frame, ledCount, fireZoneLeds, t);
  for (const e of entities) {
    // Suppress lead emphasis when the lead is hiding inside a tunnel.
    const isLead = e.id === leadId && !isInTunnel(e.pos, tunnels, ledCount);
    renderEntity(frame, e.pos, e.rgb, ledCount, isLead, t, cfg.render);
  }
  // Tunnels paint LAST over the entity layer so occluded entities are masked
  // by the tunnel's fixed color (per spec: "not drawn — but they still exist").
  renderTunnels(frame, tunnels, ledCount, fireZoneLeds);
  applyBrightness(frame, brightness);
  return frame;
}
