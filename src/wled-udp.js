import dgram from 'node:dgram';
import { buildDrgbPacket, buildDnrgbPackets } from './wled-packets.js';

export function createSender() {
  const sock = dgram.createSocket('udp4');
  sock.unref();

  function sendOne({ host, udpPort }, pkt) {
    return new Promise((resolve, reject) => {
      sock.send(pkt, udpPort, host, (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  async function sendFrame({ host, udpPort = 21324 }, rgbBuf) {
    const ledCount = rgbBuf.length / 3;
    if (ledCount <= 489) {
      await sendOne({ host, udpPort }, buildDrgbPacket(rgbBuf));
    } else {
      const packets = buildDnrgbPackets(rgbBuf, 489);
      for (let i = 0; i < packets.length; i++) {
        await sendOne({ host, udpPort }, packets[i]);
        if (i < packets.length - 1) {
          await new Promise(r => setTimeout(r, 1));
        }
      }
    }
  }

  function close() {
    try { sock.close(); } catch (_) {}
  }

  return { sendFrame, close };
}
