export function parseHex(s) {
  if (typeof s !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error(`bad hex color: ${s}`);
  }
  return [
    parseInt(s.slice(1, 3), 16),
    parseInt(s.slice(3, 5), 16),
    parseInt(s.slice(5, 7), 16),
  ];
}

export function baseColor(c) {
  switch (c) {
    case 'R': return [255, 0, 0];
    case 'G': return [0, 255, 0];
    case 'B': return [0, 0, 255];
    default: throw new Error(`bad color: ${c}`);
  }
}

export function whiteMix(rgb, w) {
  const [r, g, b] = rgb;
  return [
    Math.floor(r + w * (255 - r)),
    Math.floor(g + w * (255 - g)),
    Math.floor(b + w * (255 - b)),
  ];
}

export function satAdd(a, b) {
  return [
    Math.min(255, a[0] + b[0]),
    Math.min(255, a[1] + b[1]),
    Math.min(255, a[2] + b[2]),
  ];
}
