import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMessage } from '../src/protocol.js';

test('parses ping', () => {
  const m = parseClientMessage(JSON.stringify({ type: 'ping' }));
  assert.equal(m.type, 'ping');
});

test('parses start with required fields', () => {
  const m = parseClientMessage(JSON.stringify({
    type: 'start',
    wledId: 'wled-141',
    wrongColorMode: 'consumed',
    kidsMode: false,
    background: { mode: 'off' },
  }));
  assert.equal(m.type, 'start');
  assert.equal(m.wledId, 'wled-141');
  assert.equal(m.wrongColorMode, 'consumed');
});

test('rejects start without wledId', () => {
  assert.throws(() => parseClientMessage(JSON.stringify({
    type: 'start', wrongColorMode: 'consumed', kidsMode: false, background: { mode: 'off' },
  })));
});

test('rejects start with invalid wrongColorMode', () => {
  assert.throws(() => parseClientMessage(JSON.stringify({
    type: 'start', wledId: 'x', wrongColorMode: 'bogus', kidsMode: false, background: { mode: 'off' },
  })));
});

test('parses shoot with valid color', () => {
  const m = parseClientMessage(JSON.stringify({ type: 'shoot', color: 'R' }));
  assert.equal(m.color, 'R');
});

test('rejects shoot with invalid color', () => {
  assert.throws(() => parseClientMessage(JSON.stringify({ type: 'shoot', color: 'X' })));
});

test('parses brightness with clamped value', () => {
  const m = parseClientMessage(JSON.stringify({ type: 'brightness', value: 150 }));
  assert.equal(m.value, 100);
  const m2 = parseClientMessage(JSON.stringify({ type: 'brightness', value: -3 }));
  assert.equal(m2.value, 0);
});

test('rejects unknown type', () => {
  assert.throws(() => parseClientMessage(JSON.stringify({ type: 'eat-the-rich' })));
});

test('rejects malformed json', () => {
  assert.throws(() => parseClientMessage('{not json'));
});
