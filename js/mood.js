// Mood shapes on canvas. One radial function with 8 lobes; every parameter is interpolated on a continuous
// level (1 = molto spiacevole … 7 = molto piacevole) so the shape morphs smoothly under the slider:
// faceted crystal spikes (unpleasant) → ripples (neutral) → double petals with veins and pistil (pleasant).
// With a time tm (seconds) the shape lives: it breathes and turns at every level, crystals glint, ripples flow
// outwards, petals sway and the pistil twinkles. tm = 0 draws the still shape.

const N = 8;
// amp, sharp, inner colour, outer colour, facet, ripple, petals
const LEVELS = [
  [0.34, 5.0, '#8b6cff', '#34248f', 1.0, 0.0, 0.0],
  [0.26, 3.6, '#7c7cff', '#2f3aa8', 0.8, 0.0, 0.0],
  [0.15, 2.4, '#6aa2ff', '#2a5bbf', 0.5, 0.25, 0.0],
  [0.035, 1.6, '#5fd2e2', '#23809f', 0.0, 1.0, 0.0],
  [0.09, 0.9, '#74e0aa', '#23915f', 0.0, 0.3, 0.6],
  [0.15, 0.65, '#ffe08a', '#ec9a22', 0.0, 0.0, 0.9],
  [0.2, 0.5, '#ffc477', '#ff5f36', 0.0, 0.0, 1.0],
];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a + (b - a) * t;
const css = (c, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;

/** Interpolated drawing parameters for a level in 1..7. */
export function moodParams(level) {
  const x = Math.min(6, Math.max(0, level - 1));
  const i = Math.min(5, Math.floor(x));
  const t = x - i;
  const [a, b] = [LEVELS[i], LEVELS[i + 1]];
  return {
    amp: lerp(a[0], b[0], t),
    sharp: lerp(a[1], b[1], t),
    inner: hex(a[2]).map((v, k) => lerp(v, hex(b[2])[k], t)),
    outer: hex(a[3]).map((v, k) => lerp(v, hex(b[3])[k], t)),
    facet: lerp(a[4], b[4], t),
    ripple: lerp(a[5], b[5], t),
    petals: lerp(a[6], b[6], t),
  };
}

/** Solid colour for a (possibly fractional) level, for chart dots. */
export function moodColor(level) {
  const p = moodParams(level);
  return css(p.inner.map((v, k) => v * 0.45 + p.outer[k] * 0.55));
}

const radius = (th, amp, sharp) => 1 + amp * (2 * Math.abs(Math.cos((N * th) / 2)) ** sharp - 1);

function outline(ctx, cx, cy, R, amp, sharp, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i <= 240; i++) {
    const th = (2 * Math.PI * i) / 240;
    const r = R * radius(th - rot, amp, sharp);
    const x = cx + r * Math.sin(th);
    const y = cy - r * Math.cos(th);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Draw the mood shape for `level` (1..7) at time `tm`; `faded` draws a placeholder (no mood yet). */
export function drawMood(canvas, level, { faded = false, tm = 0 } = {}) {
  const size = canvas.clientWidth || Number(canvas.getAttribute('width'));
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.globalAlpha = faded ? 0.35 : 1;
  const p = moodParams(faded ? 4 : level);
  const c = size / 2;
  const live = tm > 0;
  const breath = 1 + 0.04 * Math.sin(tm * 1.5) * (0.35 + 0.65 * p.petals + 0.3 * p.ripple);
  const R = size * 0.33 * breath;
  // Turns at one steady speed at every level (a level-dependent speed × a large tm would make the angle jump
  // while the slider moves); petals also sway.
  const rot = tm * 0.1 + 0.07 * Math.sin(tm * 1.1) * p.petals;
  const lw = Math.max(0.6, size / 220);

  // aura + glow
  outline(ctx, c, c, R * 1.13, p.amp, p.sharp, rot);
  ctx.strokeStyle = css(p.outer, 0.35);
  ctx.lineWidth = 1.2 * lw;
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = css(p.outer, 0.55);
  ctx.shadowBlur = size * (0.08 + 0.02 * Math.sin(tm * 1.5));
  outline(ctx, c, c, R, p.amp, p.sharp, rot);
  const body = ctx.createRadialGradient(c * 0.84, c * 0.76, 0, c, c, R * 1.4);
  body.addColorStop(0, css(p.inner));
  body.addColorStop(1, css(p.outer));
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();

  // details, clipped to the body
  ctx.save();
  outline(ctx, c, c, R, p.amp, p.sharp, rot);
  ctx.clip();
  if (p.facet > 0.01) {                                        // crystal facets: light / dark half of each spike
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N + rot;
      const glint = live ? 0.65 + 0.35 * Math.sin(tm * 2.4 + i * 1.9) : 1;
      for (const [b, col] of [[a + Math.PI / N, [255, 255, 255]], [a - Math.PI / N, [0, 0, 0]]]) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + 2 * R * Math.sin(a), c - 2 * R * Math.cos(a));
        ctx.lineTo(c + 2 * R * Math.sin(b), c - 2 * R * Math.cos(b));
        ctx.closePath();
        ctx.fillStyle = css(col, 0.13 * p.facet * (col[0] && live ? glint * 1.4 : 1));
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(c + 0.25 * R * Math.sin(a), c - 0.25 * R * Math.cos(a));
      ctx.lineTo(c + 1.4 * R * Math.sin(a), c - 1.4 * R * Math.cos(a));
      ctx.strokeStyle = css([255, 255, 255], 0.35 * p.facet * glint);
      ctx.lineWidth = 1.2 * lw;
      ctx.stroke();
    }
  }
  if (p.ripple > 0.01) {                                       // ripples, flowing outwards when live
    ctx.lineWidth = R * 0.05;
    const phase = live ? (tm * 0.35) % 1 : 0;
    for (let k = 0; k < 8; k++) {
      const f = (k + phase) / 7;
      if (f > 1 || f <= 0) continue;
      ctx.beginPath();
      ctx.arc(c, c, R * 1.05 * f, 0, 2 * Math.PI);
      ctx.strokeStyle = css([255, 255, 255], (live ? 0.14 * Math.sin(Math.PI * f) : 0.11) * p.ripple);
      ctx.stroke();
    }
  }
  // inner layer, counter-rotating
  outline(ctx, c, c, R * 0.62, p.amp * 0.9, p.sharp, Math.PI / N - rot * 1.5);
  ctx.fillStyle = css(p.inner.map((v) => v * 0.6 + 255 * 0.4), 0.35 + 0.2 * p.petals);
  ctx.fill();
  if (p.petals > 0.01) {                                       // petal veins
    ctx.strokeStyle = css([255, 255, 255], 0.28 * p.petals);
    ctx.lineWidth = 1.4 * lw;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N + rot;
      const e = R * radius(a - rot, p.amp, p.sharp) * 0.88;
      ctx.beginPath();
      ctx.moveTo(c + 0.22 * R * Math.sin(a), c - 0.22 * R * Math.cos(a));
      ctx.lineTo(c + e * Math.sin(a), c - e * Math.cos(a));
      ctx.stroke();
    }
  }
  ctx.restore();

  // glowing core (+ pistil dots)
  const cr = R * 0.16;
  const core = ctx.createRadialGradient(c, c, 0, c, c, cr);
  core.addColorStop(0, 'rgba(255,255,255,0.85)');
  core.addColorStop(1, 'rgba(255,255,255,0.35)');
  ctx.beginPath();
  ctx.arc(c, c, cr, 0, 2 * Math.PI);
  ctx.fillStyle = core;
  ctx.fill();
  if (p.petals > 0.01) {
    for (let i = 0; i < 10; i++) {
      const a = (2 * Math.PI * i) / 10 + 0.3 + tm * 0.2;
      ctx.fillStyle = css([255, 255, 255], 0.75 * p.petals * (live ? 0.6 + 0.4 * Math.sin(tm * 2.2 + i * 1.3) : 1));
      ctx.beginPath();
      ctx.arc(c + Math.sin(a) * cr * 1.45, c - Math.cos(a) * cr * 1.45, cr * 0.17, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
