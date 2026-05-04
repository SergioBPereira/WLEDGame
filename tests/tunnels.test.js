import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, startRound, tunnelsForLevel, pickTunnelBase } from '../src/game.js';
import { renderTransitionFrame } from '../src/render.js';

const FIRE_LEDS = 4;

function startedRound({ ledCount = 200, tunnels = true, rng = () => 0.5 } = {}) {
  const gs = createGameState({ ledCount, fireZoneLeds: FIRE_LEDS });
  startRound(gs, {
    wrongColorMode: 'consumed', kidsMode: false, wEnemies: false, endless: false,
    tunnels, wledId: 'w', background: { mode: 'off' }, brightness: 100,
  });
  // Make tunnel base deterministic for this test:
  if (tunnels) gs.tunnelBase = pickTunnelBase(ledCount, FIRE_LEDS, rng);
  return gs;
}

test('pickTunnelBase keeps the base out of the first 33% and leaves room before fire', () => {
  for (let trial = 0; trial < 50; trial++) {
    const ledCount = 100 + Math.floor(Math.random() * 600);
    const base = pickTunnelBase(ledCount, FIRE_LEDS);
    const minBase = Math.floor(ledCount * 0.33);
    const maxSize = Math.max(1, Math.floor(ledCount * 0.15));
    const maxBase = ledCount - FIRE_LEDS - maxSize;
    assert.ok(base >= minBase, `base ${base} < minBase ${minBase} for ledCount ${ledCount}`);
    assert.ok(base <= maxBase, `base ${base} > maxBase ${maxBase} for ledCount ${ledCount}`);
  }
});

test('tunnelsForLevel: empty when tunnels disabled', () => {
  const gs = startedRound({ tunnels: false });
  assert.deepEqual(tunnelsForLevel(gs, 0), []);
  assert.deepEqual(tunnelsForLevel(gs, 5), []);
});

test('tunnelsForLevel: starts at 5% and grows by 1 LED per level', () => {
  const gs = startedRound({ ledCount: 200, rng: () => 0.5 });
  const t0 = tunnelsForLevel(gs, 0)[0];
  const t1 = tunnelsForLevel(gs, 1)[0];
  const t5 = tunnelsForLevel(gs, 5)[0];
  // 5% of 200 = 10
  assert.equal(t0.endLed - t0.startLed + 1, 10);
  assert.equal(t1.endLed - t1.startLed + 1, 11);
  assert.equal(t5.endLed - t5.startLed + 1, 15);
  // Same start position across levels — only end grows toward the fire.
  assert.equal(t0.startLed, t1.startLed);
  assert.equal(t1.startLed, t5.startLed);
  assert.ok(t1.endLed > t0.endLed);
});

test('tunnelsForLevel: caps at 15% of ledCount', () => {
  const gs = startedRound({ ledCount: 200, rng: () => 0.5 });
  // 15% of 200 = 30. We pass a high level idx — must not exceed 30.
  const huge = tunnelsForLevel(gs, 999)[0];
  assert.equal(huge.endLed - huge.startLed + 1, 30);
});

test('tunnelsForLevel: never crosses the fire zone', () => {
  // Force base near the right edge by picking the maximum allowed base.
  const ledCount = 200;
  const gs = startedRound({ ledCount, rng: () => 1 - 1e-9 });
  const maxSize = Math.floor(ledCount * 0.15);
  const expectedBase = ledCount - FIRE_LEDS - maxSize;
  assert.equal(gs.tunnelBase, expectedBase, 'rng=~1 should give max base');
  const huge = tunnelsForLevel(gs, 999)[0];
  // endLed must be < ledCount - fireZoneLeds (i.e., not into the fire zone)
  assert.ok(huge.endLed < ledCount - FIRE_LEDS, `endLed ${huge.endLed} crossed fire zone`);
});

test('renderTransitionFrame: pulses, paints non-fire LEDs in the kind color', () => {
  const f0 = renderTransitionFrame({ ledCount: 100, fireZoneLeds: FIRE_LEDS, elapsedSec: 0,    kind: 'normal',  brightness: 100 });
  const fM = renderTransitionFrame({ ledCount: 100, fireZoneLeds: FIRE_LEDS, elapsedSec: 0.75, kind: 'normal',  brightness: 100 });
  // Mid-pulse should be brighter than the start pulse (sin(0)=0 → low; sin(π/2)=1 → high)
  assert.ok(fM[0] > f0[0], 'mid pulse should be brighter than start');
  // Non-fire region painted; fire region untouched.
  for (let i = 0; i < 100 - FIRE_LEDS; i++) {
    assert.ok(fM[i*3] + fM[i*3+1] + fM[i*3+2] > 0, `LED ${i} expected lit`);
  }
  for (let i = 100 - FIRE_LEDS; i < 100; i++) {
    assert.equal(fM[i*3] + fM[i*3+1] + fM[i*3+2], 0, `fire LED ${i} expected dark`);
  }
});

test('renderTransitionFrame: kind picks the color', () => {
  const cyan    = renderTransitionFrame({ ledCount: 20, fireZoneLeds: 4, elapsedSec: 0.75, kind: 'normal',  brightness: 100 });
  const amber   = renderTransitionFrame({ ledCount: 20, fireZoneLeds: 4, elapsedSec: 0.75, kind: 'boss',    brightness: 100 });
  const magenta = renderTransitionFrame({ ledCount: 20, fireZoneLeds: 4, elapsedSec: 0.75, kind: 'endless', brightness: 100 });
  // Cyan: blue dominates over red.
  assert.ok(cyan[2]    > cyan[0],    'cyan kind: B should exceed R');
  // Amber: red dominates over blue.
  assert.ok(amber[0]   > amber[2],   'boss kind: R should exceed B');
  // Magenta: red and blue both significant; green low.
  assert.ok(magenta[0] > magenta[1] && magenta[2] > magenta[1], 'endless kind: R and B should exceed G');
});
