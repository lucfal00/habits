// SVG chart builders (return markup strings) and a shared hover/tap tooltip.
// Marks: 2px lines, 8px dots, 4px rounded bar tops on the baseline, 2px gaps; text uses text tokens only.
import { addDays, weekStart, fromKey } from './logic.js';
import { esc, fmtFull, fmtNum, pct, MONTHS, DAY_SHORT } from './ui.js';
import { moodColor } from './mood.js';

// ---- Progress ring -----------------------------------------------------

export function ring(f, color, size = 46, stroke = 5) {
  const c = size / 2;
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, f || 0));
  const arc = v > 0
    ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" style="stroke:${color}" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${(v * len).toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`
    : '';
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" style="stroke:var(--track)" stroke-width="${stroke}"/>${arc}</svg>`;
}

// ---- Calendar heatmap (sequential: one hue, quantised opacity) --------

const STEPS = [0.35, 0.55, 0.78, 1];
const level = (v) => STEPS[Math.min(3, Math.ceil(v * 4) - 1)];

function cellStyle(v, color) {
  if (v == null) return 'fill:var(--empty)';
  if (v === 0) return 'fill:var(--track)';
  return `fill:${color};fill-opacity:${level(v)}`;
}

/** valueAt(key) → null (not applicable) | 0..1. Last 53 weeks ending with today's week. */
export function heatmap(valueAt, color, today) {
  const cell = 12;
  const step = cell + 3;
  const top = 18;
  const left = 30;
  const weeks = 53;
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  let cells = '';
  let months = '';
  let lastMonth = -1;
  let lastX = -99;
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(first, 7 * w);
    const x = left + w * step;
    const m = fromKey(ws).getMonth();
    if (m !== lastMonth && x - lastX >= 3 * step) {
      months += `<text x="${x}" y="11">${MONTHS[m]}</text>`;
      lastX = x;
    }
    lastMonth = m;
    for (let d = 0; d < 7; d++) {
      const k = addDays(ws, d);
      if (k > today) break;
      const v = valueAt(k);
      const tip = `${fmtFull(k)} · ${v == null ? 'non prevista' : pct(v)}`;
      cells += `<rect x="${x}" y="${top + d * step}" width="${cell}" height="${cell}" rx="3" style="${cellStyle(v, color)}" data-tip="${esc(tip)}"/>`;
    }
  }
  const days = [0, 2, 4].map((d) => `<text x="0" y="${top + d * step + 10}">${DAY_SHORT[d]}</text>`).join('');
  const W = left + weeks * step;
  const H = top + 7 * step;
  const swatch = (v) => `<i style="background:${v == null ? 'var(--track)' : color};opacity:${v ?? 1}"></i>`;
  return `<div class="heat-scroll"><svg class="chart heatmap" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
      role="img" aria-label="Calendario degli ultimi 12 mesi">${months}${days}${cells}</svg></div>
    <div class="heat-legend">Meno ${swatch(null)}${STEPS.map(swatch).join('')} Più</div>`;
}

// ---- Shared axes frame -------------------------------------------------

const FRAME = { W: 320, H: 160, L: 36, R: 16, T: 14, B: 24 };

/** Labels: every point up to 12 (a full week / year); if the caller left some labels empty it chose them; else every k-th. */
function xLabels(points, x, h = FRAME.H) {
  const chosen = points.some((p) => !p.label);
  const every = points.length <= 12 ? 1 : Math.ceil(points.length / 6);
  return points.map((p, i) => ((chosen ? p.label : (points.length - 1 - i) % every === 0)
    ? `<text x="${x(i).toFixed(1)}" y="${h - 6}" text-anchor="middle">${esc(p.label)}</text>` : '')).join('');
}

// ---- Line: % over time (single series, no legend) ---------------------

/** points: [{ label, tip, value: null | 0..1 }]; one slot per point, so the axis is always complete. */
export function lineChart(points, color, ariaLabel) {
  const { W, H, L, R, T } = FRAME;
  const ih = H - T - FRAME.B;
  const { x } = slots(points.length);
  const y = (v) => T + ih * (1 - v);
  const dotR = points.length > 20 ? 3 : 4;
  const grid = [0, 0.5, 1].map((g) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/>
    <text x="${L - 6}" y="${y(g) + 3}" text-anchor="end">${g * 100}%</text>`).join('');
  let d = '';
  let pen = false;
  let dots = '';
  points.forEach((p, i) => {
    if (p.value == null) { pen = false; return; }
    const px = x(i).toFixed(1);
    const py = y(p.value).toFixed(1);
    d += `${pen ? 'L' : 'M'}${px} ${py}`;
    pen = true;
    dots += `<circle cx="${px}" cy="${py}" r="${dotR}" style="fill:${color};stroke:var(--card)" stroke-width="2"/>
      <circle class="hit" cx="${px}" cy="${py}" r="14" data-tip="${esc(`${p.tip} · ${pct(p.value)}`)}"/>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${grid}${xLabels(points, x)}
    <path d="${d}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
}

// ---- Bars: value vs target (single series) -----------------------------

/** points: [{ label, tip, value }]; bars below target are lighter, target is a dashed line. */
export function barChart(points, target, color, unit, ariaLabel) {
  const { W, H, L, R, T, B } = FRAME;
  const iw = W - L - R;
  const ih = H - T - B;
  const max = Math.max(target, ...points.map((p) => p.value)) * 1.1;
  const y = (v) => T + ih * (1 - v / max);
  const base = y(0);
  const slot = iw / points.length;
  const bw = Math.max(2, slot - 2);
  const x = (i) => L + i * slot + 1;
  let bars = '';
  points.forEach((p, i) => {
    const x0 = x(i);
    if (p.value > 0) {
      const top = y(p.value);
      const r = Math.min(4, bw / 2, base - top);
      bars += `<path d="M${x0} ${base}V${top + r}Q${x0} ${top} ${x0 + r} ${top}H${x0 + bw - r}Q${x0 + bw} ${top} ${x0 + bw} ${top + r}V${base}Z"
        style="fill:${color};fill-opacity:${p.value >= target ? 1 : 0.45}"/>`;
    }
    bars += `<rect class="hit" x="${x0 - 1}" y="${T}" width="${slot}" height="${ih}" data-tip="${esc(`${p.tip} · ${fmtNum(p.value)} ${unit}`)}"/>`;
  });
  const ty = y(target);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">
    <line class="grid" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/>
    <text x="${L - 6}" y="${base + 3}" text-anchor="end">0</text>
    ${bars}
    <line class="target" x1="${L}" x2="${W - R}" y1="${ty}" y2="${ty}"/>
    <text x="${L - 6}" y="${ty + 3}" text-anchor="end">${fmtNum(target)}</text>
    ${xLabels(points, (i) => x(i) + bw / 2)}</svg>
    <div class="heat-legend"><span class="dash"></span> obiettivo ${fmtNum(target)} ${esc(unit)}</div>`;
}

// ---- Mood vs habits (aligned day slots; one measure per chart, never a dual axis) ----

const SLOT = { W: 320, L: 36, R: 16 };

/** Slot layout shared by moodDots and habitBars so the two charts line up day by day. */
function slots(n) {
  const slot = (SLOT.W - SLOT.L - SLOT.R) / n;
  return { slot, x: (i) => SLOT.L + (i + 0.5) * slot };
}

/** points: [{ mood: null | 1..7 (may be fractional), tip }]. Mood bands in the background. */
export function moodDots(points, ariaLabel) {
  const H = 150;
  const T = 8;
  const B = 6;
  const ih = H - T - B;
  const { slot, x } = slots(points.length);
  const y = (lv) => T + ih * (1 - (lv - 1) / 6);
  const band = (a, b, lv, label) => `<rect x="${SLOT.L}" y="${y(b)}" width="${SLOT.W - SLOT.L - SLOT.R}" height="${y(a) - y(b)}"
      style="fill:${moodColor(lv)};fill-opacity:.1"/>
    <text x="${SLOT.L - 5}" y="${(y(a) + y(b)) / 2 + 3}" text-anchor="end">${label}</text>`;
  const r = Math.max(3.2, Math.min(5.5, slot * 0.36));
  let dots = '';
  points.forEach((p, i) => {
    if (p.mood != null) {
      dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.mood).toFixed(1)}" r="${r}" style="fill:${moodColor(p.mood)};stroke:var(--card)" stroke-width="1.5"/>`;
    }
    dots += `<rect class="hit" x="${(x(i) - slot / 2).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ih}" data-tip="${esc(p.tip)}"/>`;
  });
  return `<svg class="chart" viewBox="0 0 ${SLOT.W} ${H}" role="img" aria-label="${esc(ariaLabel)}">
    ${band(1, 3.5, 2, '☹︎')}${band(3.5, 4.5, 4, '–')}${band(4.5, 7, 6, '☺︎')}${dots}</svg>`;
}

/** points: [{ completion: null | 0..1, label, tip }]; x labels shown here, under both charts. */
export function habitBars(points, ariaLabel) {
  const H = 96;
  const T = 6;
  const B = 22;
  const ih = H - T - B;
  const { slot, x } = slots(points.length);
  const base = T + ih;
  const bw = Math.max(2, slot * 0.62);
  let bars = '';
  points.forEach((p, i) => {
    const x0 = x(i) - bw / 2;
    if (p.completion > 0) {
      const top = base - ih * p.completion;
      const rr = Math.min(3, bw / 2, base - top);
      bars += `<path d="M${x0} ${base}V${top + rr}Q${x0} ${top} ${x0 + rr} ${top}H${x0 + bw - rr}Q${x0 + bw} ${top} ${x0 + bw} ${top + rr}V${base}Z"
        style="fill:var(--accent);fill-opacity:.85"/>`;
    }
    bars += `<rect class="hit" x="${(x(i) - slot / 2).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ih}" data-tip="${esc(p.tip)}"/>`;
  });
  const labels = xLabels(points, x, H);
  return `<svg class="chart" viewBox="0 0 ${SLOT.W} ${H}" role="img" aria-label="${esc(ariaLabel)}">
    <line class="grid" x1="${SLOT.L}" x2="${SLOT.W - SLOT.R}" y1="${T}" y2="${T}"/>
    <line class="grid" x1="${SLOT.L}" x2="${SLOT.W - SLOT.R}" y1="${base}" y2="${base}"/>
    <text x="${SLOT.L - 5}" y="${T + 3}" text-anchor="end">100%</text>
    <text x="${SLOT.L - 5}" y="${base + 3}" text-anchor="end">0%</text>
    ${bars}${labels}</svg>`;
}

/** levels: [{ level, values: [0..1], avg }] → every day as a faint dot, the mean per level highlighted. */
export function moodCorrelation(levels, labels, ariaLabel) {
  const H = 170;
  const T = 10;
  const B = 24;
  const ih = H - T - B;
  const { slot, x } = slots(7);
  const y = (v) => T + ih * (1 - v);
  const grid = [0, 0.5, 1].map((g) => `<line class="grid" x1="${SLOT.L}" x2="${SLOT.W - SLOT.R}" y1="${y(g)}" y2="${y(g)}"/>
    <text x="${SLOT.L - 5}" y="${y(g) + 3}" text-anchor="end">${g * 100}%</text>`).join('');
  let faint = '';
  let means = '';
  const trend = [];
  levels.forEach((l, i) => {
    l.values.forEach((v, j) => {
      const jitter = ((((j * 37) % 11) - 5) / 5) * slot * 0.22;
      faint += `<circle cx="${(x(i) + jitter).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" style="fill:${moodColor(l.level)};fill-opacity:.38"/>`;
    });
    if (l.avg != null) {
      trend.push(`${x(i).toFixed(1)} ${y(l.avg).toFixed(1)}`);
      means += `<circle cx="${x(i).toFixed(1)}" cy="${y(l.avg).toFixed(1)}" r="5.5" style="fill:${moodColor(l.level)};stroke:var(--card)" stroke-width="2"/>
        <circle class="hit" cx="${x(i).toFixed(1)}" cy="${y(l.avg).toFixed(1)}" r="14"
          data-tip="${esc(`${labels[i]}: media ${pct(l.avg)} (${l.values.length} ${l.values.length === 1 ? 'giorno' : 'giorni'})`)}"/>`;
    }
  });
  const path = trend.length > 1 ? `<path d="M${trend.join('L')}" fill="none" style="stroke:var(--muted)" stroke-width="1.5" stroke-dasharray="3 3"/>` : '';
  const xl = `<text x="${x(0)}" y="${H - 6}" text-anchor="start">Spiacevole</text>
    <text x="${x(3)}" y="${H - 6}" text-anchor="middle">Neutro</text>
    <text x="${x(6)}" y="${H - 6}" text-anchor="end">Piacevole</text>`;
  return `<svg class="chart" viewBox="0 0 ${SLOT.W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${grid}${faint}${path}${means}${xl}</svg>`;
}

// ---- Tooltip -----------------------------------------------------------

let tipEl;

export function hideTip() {
  if (tipEl) tipEl.hidden = true;
}

/** One floating tooltip for every [data-tip] element; hover on desktop, tap on touch. */
export function initTooltips() {
  tipEl = Object.assign(document.createElement('div'), { className: 'tip', hidden: true });
  document.body.append(tipEl);
  const show = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { hideTip(); return; }
    tipEl.textContent = t.dataset.tip;
    tipEl.hidden = false;
    const r = t.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    tipEl.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8)}px`;
    tipEl.style.top = `${r.top - h - 8 < 0 ? r.bottom + 8 : r.top - h - 8}px`;
  };
  document.addEventListener('pointerover', show);
  document.addEventListener('click', show);
  addEventListener('scroll', hideTip, { capture: true, passive: true });
}
