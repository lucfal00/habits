// Generates icons/*.png (no dependencies): gradient square, progress ring, check mark.
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../icons/', import.meta.url);
const A = [0x63, 0x66, 0xf1];   // #6366f1
const B = [0xa8, 0x55, 0xf7];   // #a855f7

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgb) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;                    // bit depth
  ihdr[9] = 2;                    // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Geometry in 0..100 units, matching icons/icon.svg. */
function draw(size) {
  const s = size / 100;
  const rgb = Buffer.alloc(size * size * 3);
  const half = 3.5 * s;                                   // stroke 7
  const R = 32 * s;
  const C = 50 * s;
  const arcEnd = 0.75 * 2 * Math.PI;
  const end = [C + R * Math.sin(arcEnd), C - R * Math.cos(arcEnd)];
  const check = [[38, 51], [47, 60], [63, 43]].map(([x, y]) => [x * s, y * s]);
  const cover = (d) => Math.max(0, Math.min(1, half - d + 0.5));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = (px + py) / (2 * size);
      let col = A.map((a, i) => a + (B[i] - a) * t);
      const dr = Math.abs(Math.hypot(px - C, py - C) - R);
      let ang = Math.atan2(px - C, -(py - C));
      if (ang < 0) ang += 2 * Math.PI;
      const arc = ang <= arcEnd
        ? cover(dr)
        : Math.max(cover(Math.hypot(px - C, py - C + R)), cover(Math.hypot(px - end[0], py - end[1])));
      const ringA = Math.max(0.25 * cover(dr), arc);
      const checkA = Math.min(
        cover(segDist(px, py, ...check[0], ...check[1])) + cover(segDist(px, py, ...check[1], ...check[2])), 1);
      const a = Math.max(ringA, checkA);
      col = col.map((c) => Math.round(c + (255 - c) * a));
      rgb.set(col, (y * size + x) * 3);
    }
  }
  return png(size, rgb);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, OUT), draw(size));
  console.log('wrote icons/' + name);
}
