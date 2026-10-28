// "Statistiche": one period selector (week / month / 6 months / year) drives every chart; heatmap; per-habit detail.
import {
  activeHabits, addDays, fromKey, dayPercent, habitDayFraction, periodPercent, currentStreak, bestStreak, valueOf,
  moodStats, moodByLevel, periodRange, shiftPeriod, bucketStats, MOOD_LABELS,
} from '../logic.js';
import { heatmap, lineChart, barChart, moodDots, habitBars, moodCorrelation } from '../charts.js';
import { esc, safeColor, fmtShort, fmtDay, fmtNum, pct, cap, MONTHS, DAY_SHORT } from '../ui.js';

const PERIODS = [['settimana', 'Settimana'], ['mese', 'Mese'], ['6mesi', '6 mesi'], ['anno', 'Anno']];
const monthYear = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
let period = 'settimana';
let anchor = null;                        // a day inside the shown period; null = the current one

const dm = (key) => `${+key.slice(8)} ${MONTHS[+key.slice(5, 7) - 1].toLowerCase()}`;

function periodTitle(kind, r) {
  if (kind === 'settimana') return `${dm(r.from)} – ${dm(r.to)}`;
  if (kind === 'mese') return cap(monthYear.format(fromKey(r.from)));
  if (kind === '6mesi') return `${MONTHS[+r.from.slice(5, 7) - 1]} – ${MONTHS[+r.to.slice(5, 7) - 1]} ${r.to.slice(0, 4)}`;
  return r.from.slice(0, 4);
}

/** Axis label (empty = no label) and tooltip prefix for each bucket; the axis always covers the whole period. */
function describe(kind, buckets) {
  let lastMonth = -1;
  return buckets.map((b, i) => {
    const day = +b.from.slice(8);
    const month = +b.to.slice(5, 7) - 1;
    if (kind === 'settimana') return { label: DAY_SHORT[i], tip: fmtDay(b.from) };
    if (kind === 'mese') return { label: [1, 8, 15, 22, 29].includes(day) ? String(day) : '', tip: fmtDay(b.from) };
    if (kind === '6mesi') {
      const label = month !== lastMonth ? MONTHS[month] : '';
      lastMonth = month;
      return { label, tip: `Settimana dal ${fmtShort(b.from)}` };
    }
    return { label: MONTHS[i], tip: `${MONTHS[i]} ${b.from.slice(0, 4)}` };
  });
}

const last30 = (doc, h, today) => periodPercent(doc, [h], addDays(today, -29), today, today);

function moodSection(doc, kind, r, stats, labels, today) {
  const end = r.to < today ? r.to : today;
  const s = moodStats(doc, r.from, end);
  if (!s.days) {
    return `<section class="card"><h2>Umore</h2>
      <p class="muted">Nessun umore registrato in questo periodo. Registralo dalla schermata Oggi: qui vedrai come cambia
      e come va insieme alle abitudini.</p></section>`;
  }
  const single = kind === 'settimana' || kind === 'mese';
  const moodPts = stats.map((b, i) => ({
    mood: b.mood,
    tip: b.mood == null ? `${labels[i].tip} · umore non registrato`
      : single ? `${labels[i].tip} · ${MOOD_LABELS[Math.round(b.mood) - 1]}`
        : `${labels[i].tip} · umore medio: ${MOOD_LABELS[Math.round(b.mood) - 1]} (${b.n} ${b.n === 1 ? 'giorno' : 'giorni'})`,
  }));
  const habitPts = stats.map((b, i) => ({
    completion: b.completion,
    label: labels[i].label,
    tip: `${labels[i].tip} · abitudini ${pct(b.completion)}`,
  }));
  const { piacevole: good, spiacevole: bad } = s.byBand;
  const compare = good != null && bad != null
    ? `Nei giorni piacevoli completi in media il <b>${pct(good)}</b> delle abitudini, in quelli spiacevoli il <b>${pct(bad)}</b>.`
    : good != null ? `Nei giorni piacevoli completi in media il <b>${pct(good)}</b> delle abitudini.`
      : bad != null ? `Nei giorni spiacevoli completi in media il <b>${pct(bad)}</b> delle abitudini.` : '';
  const levels = moodByLevel(doc, r.from, end);
  const enough = levels.reduce((n, l) => n + l.values.length, 0) >= 2;
  const top = (list) => list.slice(0, 4).map(([n, c]) => `<span class="chip static">${esc(n)} <small>×${c}</small></span>`).join('');
  return `<section class="card"><h2>Umore</h2>
      ${moodDots(moodPts, 'Umore nel periodo')}
      <p class="chart-sub">Abitudini completate</p>
      ${habitBars(habitPts, 'Abitudini completate nel periodo')}
      ${compare ? `<p class="mood-compare">${compare}</p>` : ''}
    </section>
    <section class="card"><h2>Umore e abitudini</h2>
      ${enough ? `<p class="muted chart-note">Ogni puntino tenue è un giorno; quello pieno è la media per livello di umore.</p>
        ${moodCorrelation(levels, MOOD_LABELS, 'Completamento medio delle abitudini per livello di umore')}`
    : '<p class="muted">Servono almeno due giorni con umore registrato per confrontarli.</p>'}
      ${s.feelings.length ? `<p class="muted mood-sub">Emozioni più frequenti</p><div class="chips">${top(s.feelings)}</div>` : ''}
      ${s.factors.length ? `<p class="muted mood-sub">Cosa influisce di più</p><div class="chips">${top(s.factors)}</div>` : ''}
    </section>`;
}

function overview(el, doc, today, refresh) {
  const habits = activeHabits(doc);
  if (!habits.length) {
    el.innerHTML = `<header class="top"><h1>Statistiche</h1></header>
      <div class="card empty"><p class="muted">Crea un'abitudine per vedere i progressi.</p>
      <a class="btn primary" href="#abitudini/nuova">+ Nuova abitudine</a></div>`;
    return;
  }
  const at = anchor && anchor <= today ? anchor : today;
  const r = periodRange(period, at);
  const stats = bucketStats(doc, r.buckets, today);
  const labels = describe(period, r.buckets);
  const canNext = periodRange(period, shiftPeriod(period, at, 1)).from <= today;
  const trend = stats.map((b, i) => ({ value: b.completion, label: labels[i].label, tip: labels[i].tip }));
  const seg = PERIODS.map(([v, label]) => `<label class="pick"><input type="radio" name="period" value="${v}"
    ${period === v ? 'checked' : ''}><span>${label}</span></label>`).join('');
  const rows = habits.map((h) => {
    const unit = h.freq.kind === 'weekly' ? 'sett.' : 'gg';
    return `<li><a class="row" href="#stats/${encodeURIComponent(h.id)}">
      <span class="badge" style="--c:${safeColor(h.color)}">${esc(h.emoji || '•')}</span>
      <span style="flex:1"><b>${esc(h.name)}</b><small>30 giorni: ${pct(last30(doc, h, today))}</small></span>
      <span class="stat-meta">🔥 ${currentStreak(doc, h, today)} ${unit}<br>record ${bestStreak(doc, h, today)}</span></a></li>`;
  }).join('');

  el.innerHTML = `
    <header class="top"><h1>Statistiche</h1></header>
    <div class="seg period-seg">${seg}</div>
    <div class="period-nav">
      <button class="icon-btn" data-act="prev" aria-label="Periodo precedente">‹</button>
      <b>${periodTitle(period, r)}</b>
      <button class="icon-btn" data-act="next" aria-label="Periodo successivo" ${canNext ? '' : 'disabled'}>›</button>
    </div>
    <section class="card"><h2>Completamento</h2>
      ${lineChart(trend, 'var(--accent)', 'Percentuale di abitudini completate nel periodo', { shade: true })}
    </section>
    <section class="card"><h2>Ultimi 12 mesi</h2>${heatmap((k) => dayPercent(doc, k), 'var(--accent)', today)}</section>
    ${moodSection(doc, period, r, stats, labels, today)}
    <h2 style="margin:20px 4px 10px">Per abitudine</h2>
    <ul class="card list rows">${rows}</ul>`;

  el.onchange = (e) => {
    if (e.target.name !== 'period') return;
    period = e.target.value;
    anchor = null;
    refresh();
  };
  el.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act !== 'prev' && act !== 'next') return;
    anchor = shiftPeriod(period, at, act === 'prev' ? -1 : 1);
    refresh();
  };
  scrollHeatmaps(el);
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
