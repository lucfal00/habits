// Sleep shape on canvas: concentric waves around a glowing core. Quality is a continuous level
// (1 = pessimo … 5 = ottimo): restless, jagged plum/rose waves calm down into smooth blue/teal rings.
// With a time tm (seconds) the waves ripple and the shape breathes; tm = 0 draws it still.

const OUTER = [[125, 62, 120], [38, 78, 190]];               // pessimo → ottimo
const INNER = [[240, 130, 130], [150, 225, 235]];
const RINGS = 5;

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const css = (c, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;
const calm = (level) => Math.min(1, Math.max(0, (level - 1) / 4));

/** Solid colour for a (possibly fractional) level, for chart dots and bars. */
export function sleepColor(level) {
  const t = calm(level);
  return css(mix(mix(OUTER[0], OUTER[1], t), mix(INNER[0], INNER[1], t), 0.5));
}

/** Draw the sleep shape for `level` (1..5) at time `tm`; `faded` draws a placeholder (nothing recorded). */
export function drawSleep(canvas, level, { faded = false, tm = 0 } = {}) {
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
  const t = calm(faded ? 3 : level);
  const c = size / 2;
  const R = size * 0.36;
  const outer = mix(OUTER[0], OUTER[1], t);
  const inner = mix(INNER[0], INNER[1], t);
  const amp = (1 - t) * 0.11 + 0.006;                         // restless → calm

  ctx.save();
  ctx.shadowColor = css(outer, 0.5);
  ctx.shadowBlur = size * 0.07;
  for (let k = 0; k < RINGS; k++) {
    const r0 = R * (1 - k * 0.17) * (1 + 0.025 * Math.sin(tm * 0.9 - k * 0.7));
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const th = (2 * Math.PI * i) / 200;
      // fixed speeds, so moving the slider never makes the waves jump: a slow swell for every level and a
      // fast choppy wave that fades in as sleep gets worse
      const r = r0 * (1 + amp * Math.sin(9 * th + tm * 0.9 * (1 + k * 0.3) + k)
        + amp * 0.8 * (1 - t) * Math.sin(14 * th - tm * 3.2 + k * 2));
      const x = c + r * Math.cos(th);
      const y = c + r * Math.sin(th);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = css(mix(outer, inner, k / (RINGS - 1)), k ? 0.75 : 1);
    ctx.fill();
    if (!k) ctx.shadowBlur = 0;                               // glow only around the outer wave
    ctx.strokeStyle = css([255, 255, 255], 0.1 + 0.12 * t);
    ctx.lineWidth = Math.max(0.6, size / 180);
    ctx.stroke();
  }
  ctx.restore();

  // glowing core
  const cr = R * 0.14 * (1 + 0.06 * Math.sin(tm * 0.9));
  const core = ctx.createRadialGradient(c, c, 0, c, c, cr);
  core.addColorStop(0, 'rgba(255,255,255,0.9)');
  core.addColorStop(1, 'rgba(255,255,255,0.3)');
  ctx.beginPath();
  ctx.arc(c, c, cr, 0, 2 * Math.PI);
  ctx.fillStyle = core;
  ctx.fill();
  ctx.globalAlpha = 1;
}
