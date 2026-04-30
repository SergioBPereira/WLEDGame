import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDrgbPacket, buildDnrgbPackets } from '../src/wled-packets.js';

test('DRGB packet has [0x02, 0x01] header and N*3 payload', () => {
  const buf = new Uint8Array([10, 20, 30, 40, 50, 60]);
  const pkt = buildDrgbPacket(buf);
  assert.equal(pkt.length, 2 + 6);
  assert.equal(pkt[0], 0x02);
  assert.equal(pkt[1], 0x01);
  assert.equal(pkt[2], 10);
  assert.equal(pkt[7], 60);
});

test('DRGB packet length stays under MTU for 489 LEDs', () => {
  const buf = new Uint8Array(489 * 3);
  const pkt = buildDrgbPacket(buf);
  assert.equal(pkt.length, 2 + 489 * 3);
  assert.ok(pkt.length <= 1472);
});

test('DNRGB chunks 600 LEDs into 489 + 111 with correct indices', () => {
  const buf = new Uint8Array(600 * 3);
  for (let i = 0; i < buf.length; i++) buf[i] = i % 256;
  const packets = buildDnrgbPackets(buf, 489);
  assert.equal(packets.length, 2);

  const a = packets[0];
  assert.equal(a[0], 0x04);
  assert.equal(a[1], 0x01);
  assert.equal(a[2], 0); assert.equal(a[3], 0);
  assert.equal(a.length, 4 + 489 * 3);

  const b = packets[1];
  assert.equal(b[0], 0x04);
  assert.equal(b[1], 0x01);
  assert.equal(b[2], 0x01);
  assert.equal(b[3], 0xE9);
  assert.equal(b.length, 4 + 111 * 3);
});

test('DNRGB chunking when total exactly equals chunk size emits one packet', () => {
  const buf = new Uint8Array(489 * 3);
  const packets = buildDnrgbPackets(buf, 489);
  assert.equal(packets.length, 1);
});
