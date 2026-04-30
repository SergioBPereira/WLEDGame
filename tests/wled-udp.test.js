import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { createSender } from '../src/wled-udp.js';

function withUdpReceiver(fn) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const received = [];
    sock.on('message', (buf) => received.push(buf));
    sock.bind(0, '127.0.0.1', async () => {
      const port = sock.address().port;
      try {
        await fn({ host: '127.0.0.1', port, received });
        sock.close(resolve);
      } catch (e) {
        sock.close(() => reject(e));
      }
    });
  });
}

test('sender.sendFrame delivers DRGB packet to listener', async () => {
  await withUdpReceiver(async ({ host, port, received }) => {
    const sender = createSender();
    const rgb = new Uint8Array([1,2,3,4,5,6]);
    await sender.sendFrame({ host, udpPort: port }, rgb);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(received.length, 1);
    const pkt = received[0];
    assert.equal(pkt[0], 0x02);
    assert.equal(pkt[1], 0x01);
    assert.equal(pkt[2], 1);
    assert.equal(pkt[7], 6);
    sender.close();
  });
});

test('sender chunks DNRGB for ledCount > 489', async () => {
  await withUdpReceiver(async ({ host, port, received }) => {
    const sender = createSender();
    const rgb = new Uint8Array(600 * 3);
    await sender.sendFrame({ host, udpPort: port }, rgb);
    await new Promise(r => setTimeout(r, 60));
    assert.equal(received.length, 2);
    assert.equal(received[0][0], 0x04);
    assert.equal(received[1][0], 0x04);
    sender.close();
  });
});
