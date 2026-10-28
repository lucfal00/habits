// "Statistiche": global trend + heatmap, per-habit detail.
import {
  activeHabits, addDays, addMonths, monthEnd, weekStart, fromKey,
  dayPercent, habitDayFraction, periodPercent, currentStreak, bestStreak, valueOf, moodOf, moodStats, MOOD_LABELS,
} from '../logic.js';
import { heatmap, lineChart, barChart } from '../charts.js';
import { paintMoods } from '../mood.js';
import { esc, safeColor, fmtShort, fmtNum, pct, MONTHS } from '../ui.js';

/** Mood over the last 30 days: strip of shapes, completion per band, frequent feelings and factors. */
function moodSection(doc, today) {
  const from = addDays(today, -29);
  const s = moodStats(doc, from, today);
  if (!s.days) {
    return `<section class="card"><h2>Umore</h2>
      <p class="muted">Registra l’umore dalla schermata Oggi: qui vedrai come cambia e quanto incide sulle abitudini.</p></section>`;
  }
  const cells = Array.from({ length: 30 }, (_, i) => {
    const k = addDays(from, i);
    const m = moodOf(doc, k);
    return m
      ? `<canvas data-mood="${m.mood}" width="26" height="26" data-tip="${esc(`${fmtShort(k)} · ${MOOD_LABELS[m.mood - 1]}`)}"></canvas>`
      : `<span class="mood-empty" data-tip="${fmtShort(k)} · nessun umore"></span>`;
  }).join('');
  const { piacevole: good, spiacevole: bad } = s.byBand;
  const compare = good != null && bad != null
    ? `Nei giorni piacevoli completi in media il <b>${pct(good)}</b> delle abitudini, in quelli spiacevoli il <b>${pct(bad)}</b>.`
    : good != null ? `Nei giorni piacevoli completi in media il <b>${pct(good)}</b> delle abitudini.`
      : bad != null ? `Nei giorni spiacevoli completi in media il <b>${pct(bad)}</b> delle abitudini.` : '';
  const top = (list) => list.slice(0, 4).map(([n, c]) => `<span class="chip static">${esc(n)} <small>×${c}</small></span>`).join('');
  return `<section class="card"><h2>Umore · ultimi 30 giorni</h2>
    <div class="mood-strip">${cells}</div>
    ${compare ? `<p class="mood-compare">${compare}</p>` : ''}
    ${s.feelings.length ? `<p class="muted mood-sub">Emozioni più frequenti</p><div class="chips">${top(s.feelings)}</div>` : ''}
    ${s.factors.length ? `<p class="muted mood-sub">Cosa influisce di più</p><div class="chips">${top(s.factors)}</div>` : ''}
  </section>`;
}

let mode = 'week';

const last30 = (doc, h, today) => periodPercent(doc, [h], addDays(today, -29), today, today);

function trendPoints(doc, habits, today) {
  if (mode === 'week') {
    return Array.from({ length: 12 }, (_, i) => {
      const ws = addDays(weekStart(today), -7 * (11 - i));
      return { label: fmtShort(ws), tip: `Settimana dal ${fmtShort(ws)}`, value: periodPercent(doc, habits, ws, addDays(ws, 6), today) };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const ms = addMonths(today, i - 11);
    const d = fromKey(ms);
    return { label: MONTHS[d.getMonth()], tip: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, value: periodPercent(doc, habits, ms, monthEnd(ms), today) };
  });
}

function overview(el, doc, today, refresh) {
  const habits = activeHabits(doc);
  if (!habits.length) {
    el.innerHTML = `<header class="top"><h1>Statistiche</h1></header>
      <div class="card empty"><p class="muted">Crea un'abitudine per vedere i progressi.</p>
      <a class="btn primary" href="#abitudini/nuova">+ Nuova abitudine</a></div>`;
    return;
  }
  const seg = (v, label) => `<label class="pick"><input type="radio" name="mode" value="${v}" ${mode === v ? 'checked' : ''}><span>${label}</span></label>`;
  const rows = habits.map((h) => {
    const unit = h.freq.kind === 'weekly' ? 'sett.' : 'gg';
    return `<li><a class="row" href="#stats/${encodeURIComponent(h.id)}">
      <span class="badge" style="--c:${safeColor(h.color)}">${esc(h.emoji || '•')}</span>
      <span style="flex:1"><b>${esc(h.name)}</b><small>30 giorni: ${pct(last30(doc, h, today))}</small></span>
      <span class="stat-meta">🔥 ${currentStreak(doc, h, today)} ${unit}<br>record ${bestStreak(doc, h, today)}</span></a></li>`;
  }).join('');

  el.innerHTML = `
    <header class="top"><h1>Statistiche</h1></header>
    <section class="card">
      <div class="card-head"><h2>Completamento</h2><div class="seg">${seg('week', 'Settimane')}${seg('month', 'Mesi')}</div></div>
      ${lineChart(trendPoints(doc, habits, today), 'var(--accent)', 'Percentuale di completamento nel tempo')}
    </section>
    <section class="card"><h2>Ultimi 12 mesi</h2>${heatmap((k) => dayPercent(doc, k), 'var(--accent)', today)}</section>
    ${moodSection(doc, today)}
    <h2 style="margin:20px 4px 10px">Per abitudine</h2>
    <ul class="card list rows">${rows}</ul>`;

  el.onchange = (e) => {
    if (e.target.name !== 'mode') return;
    mode = e.target.value;
    refresh();
  };
  scrollHeatmaps(el);
  paintMoods(el);
}

function detail(el, doc, h, today) {
  const c = safeColor(h.color);
  const weekly = h.freq.kind === 'weekly';
  const unit = (n) => (weekly ? (n === 1 ? 'settimana' : 'settimane') : (n === 1 ? 'giorno' : 'giorni'));
  const cur = currentStreak(doc, h, today);
  const best = bestStreak(doc, h, today);
  let bars = '';
  if (h.type === 'quantity') {
    const pts = Array.from({ length: 30 }, (_, i) => {
      const k = addDays(today, i - 29);
      return { label: fmtShort(k), tip: fmtShort(k), value: k < h.start ? 0 : valueOf(doc, k, h.id) };
    });
    bars = `<section class="card"><h2>Ultimi 30 giorni (${esc(h.unit) || 'valore'})</h2>
      ${barChart(pts, h.target, c, h.unit,`Valori di ${h.name} negli ultimi 30 giorni`)}</section>`;
  }
  el.innerHTML = `
    <header class="top"><a class="back" href="#stats">‹ Statistiche</a></header>
    <div class="top"><span class="badge" style="--c:${c}">${esc(h.emoji || '•')}</span>
      <div class="grow"><h1>${esc(h.name)}</h1></div></div>
    <div class="tiles">
      <div class="card tile"><b>${cur}</b><small>serie attuale<br>(${unit(cur)})</small></div>
      <div class="card tile"><b>${best}</b><small>record<br>(${unit(best)})</small></div>
      <div class="card tile"><b>${pct(last30(doc, h, today))}</b><small>ultimi<br>30 giorni</small></div>
    </div>
    ${bars}
    <section class="card"><h2>Ultimi 12 mesi</h2>${heatmap((k) => habitDayFraction(doc, h, k), c, today)}</section>`;
  scrollHeatmaps(el);
}

/** Show the most recent weeks first on narrow screens. */
function scrollHeatmaps(el) {
  el.querySelectorAll('.heat-scroll').forEach((s) => { s.scrollLeft = s.scrollWidth; });
}

export function render(el, { doc, param, today, refresh }) {
  if (!param) {
    overview(el, doc, today, refresh);
    return;
  }
  const h = doc.habits.find((x) => x.id === param && !x.deleted);
  if (!h) {
    location.hash = '#stats';
    return;
  }
  detail(el, doc, h, today);
}
