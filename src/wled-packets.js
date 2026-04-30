// WLED realtime UDP protocols:
//   DRGB  : header [0x02, timeoutSec], then RGB triples for LEDs starting at 0
//   DNRGB : header [0x04, timeoutSec, indexHi, indexLo], then RGB triples
// Timeout 0x01 = 1 second. WLED resumes its previous effect after this many
// seconds without a new realtime packet.

const TIMEOUT_BYTE = 0x01;

export function buildDrgbPacket(rgbBuf) {
  const out = new Uint8Array(2 + rgbBuf.length);
  out[0] = 0x02;
  out[1] = TIMEOUT_BYTE;
  out.set(rgbBuf, 2);
  return out;
}

export function buildDnrgbPackets(rgbBuf, ledsPerPacket = 489) {
  const totalLeds = rgbBuf.length / 3;
  if (!Number.isInteger(totalLeds)) {
    throw new Error(`rgbBuf length ${rgbBuf.length} not divisible by 3`);
  }
  const packets = [];
  for (let startLed = 0; startLed < totalLeds; startLed += ledsPerPacket) {
    const endLed = Math.min(startLed + ledsPerPacket, totalLeds);
    const ledCount = endLed - startLed;
    const pkt = new Uint8Array(4 + ledCount * 3);
    pkt[0] = 0x04;
    pkt[1] = TIMEOUT_BYTE;
    pkt[2] = (startLed >> 8) & 0xff;
    pkt[3] = startLed & 0xff;
    pkt.set(rgbBuf.subarray(startLed * 3, endLed * 3), 4);
    packets.push(pkt);
  }
  return packets;
}

export function chooseProtocol(ledCount) {
  return ledCount <= 489 ? 'drgb' : 'dnrgb';
}
