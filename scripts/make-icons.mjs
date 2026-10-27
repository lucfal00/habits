// Generates icons/*.png (no dependencies), Windows 11 style: white tile, violet→blue progress ring, check mark.
// "any" icons keep a transparent margin and a soft shadow; maskable / apple-touch icons are full-bleed (iOS fills
// transparency with black). Geometry is in 0..100 units and matches icons/habits-v2.svg.
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUT = new URL('../icons/', import.meta.url);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BODY_TOP = hex('#ffffff');
const BODY_BOTTOM = hex('#eceef3');
const EDGE = hex('#d3d7e0');
const TRACK = hex('#e2e5ec');

/** ring: two gradient stops (top-left → bottom-right) or `segments` along the arc; check: colour or null (= ring). */
// Muted to sit with the Windows 11 Notes/Calendar/To Do icons (accents sampled ≈ #7593b7, #769958, #d4937f).
export const PALETTE = { ring: ['#9a86de', '#6c8fd0'], segments: null, check: null };
const RING_R = 26;
const STROKE = 7.5;
const CHECK = [[39, 51], [47, 59], [62, 43]];

// ---- PNG encoding ------------------------------------------------------

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
function png(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;                    // bit depth
  ihdr[9] = 6;                    // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Geometry ----------------------------------------------------------

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Signed distance to a rounded square centred at (cx, cy). */
function roundRect(px, py, cx, cy, half, r) {
  const qx = Math.abs(px - cx) - half + r;
  const qy = Math.abs(py - cy) - half + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Straight-alpha "over" compositing into dst = [r, g, b, a]. */
function over(dst, rgb, a) {
  if (a <= 0) return;
  const outA = a + dst[3] * (1 - a);
  for (let i = 0; i < 3; i++) dst[i] = (rgb[i] * a + dst[i] * dst[3] * (1 - a)) / outA;
  dst[3] = outA;
}

export function draw(size, tile, pal = PALETTE) {
  const [ringA, ringB] = pal.ring.map(hex);
  const segments = pal.segments?.map(hex);
  const checkColor = pal.check && hex(pal.check);
  const s = size / 100;                                  // pixels per unit
  const px1 = 1 / s;                                     // one pixel in units
  const cover = (d, half) => clamp01((half - d) / px1 + 0.5);
  const arcEnd = 0.75 * 2 * Math.PI;
  const capEnd = [50 + RING_R * Math.sin(arcEnd), 50 - RING_R * Math.cos(arcEnd)];
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      const c = [0, 0, 0, 0];
      const body = lerp(BODY_TOP, BODY_BOTTOM, v / 100);
      if (tile) {
        const shadow = roundRect(u, v, 50, 51.6, 44, 19);
        over(c, [20, 24, 40], 0.18 * (1 - clamp01((shadow + 1) / 4)));
        const d = roundRect(u, v, 50, 50, 44, 19);
        over(c, EDGE, clamp01(-d / px1 + 0.5));
        over(c, body, clamp01((-d - 0.9) / px1 + 0.5));
      } else {
        over(c, body, 1);
      }
      const accent = lerp(ringA, ringB, clamp01((u + v - 48) / 104));
      const dr = Math.abs(Math.hypot(u - 50, v - 50) - RING_R);
      over(c, TRACK, cover(dr, STROKE / 2));
      let ang = Math.atan2(u - 50, -(v - 50));
      if (ang < 0) ang += 2 * Math.PI;
      const inArc = ang <= arcEnd;
      const arc = inArc
        ? cover(dr, STROKE / 2)
        : Math.max(cover(Math.hypot(u - 50, v - 50 + RING_R), STROKE / 2),
          cover(Math.hypot(u - capEnd[0], v - capEnd[1]), STROKE / 2));
      const ringColor = segments
        ? segments[inArc ? Math.min(segments.length - 1, Math.floor((ang / arcEnd) * segments.length))
          : (ang > arcEnd + (2 * Math.PI - arcEnd) / 2 ? 0 : segments.length - 1)]
        : accent;
      over(c, ringColor, arc);
      const check = Math.min(segDist(u, v, CHECK[0], CHECK[1]), segDist(u, v, CHECK[1], CHECK[2]));
      over(c, checkColor ?? accent, cover(check, STROKE / 2));
      out.set(c.map((ch, i) => Math.round(i === 3 ? ch * 255 : ch)), (y * size + x) * 4);
    }
  }
  return png(size, out);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(OUT, { recursive: true });
  // Names carry the design version: devices cache icons by URL, so a redesign needs new names.
  const ICONS = [
    ['habits-v2-192.png', 192, true],
    ['habits-v2-512.png', 512, true],
    ['habits-v2-maskable-512.png', 512, false],
    ['habits-v2-apple-180.png', 180, false],
  ];
  for (const [name, size, tile] of ICONS) {
    writeFileSync(new URL(name, OUT), draw(size, tile));
    console.log('wrote icons/' + name);
  }
}
