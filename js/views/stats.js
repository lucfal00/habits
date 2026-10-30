// "Statistiche": one period selector (week / month / 6 months / year) drives every chart; heatmap; mood, sleep,
// which habits go with better sleep / mood; per-habit detail.
import {
  activeHabits, addDays, fromKey, dayPercent, habitDayFraction, periodPercent, currentStreak, bestStreak, valueOf,
  moodStats, moodByLevel, sleepByLevel, periodRange, shiftPeriod, bucketStats, habitEffects, MOOD_LABELS, SLEEP_LABELS,
  eventsOn,
} from '../logic.js';
import {
  heatmap, lineChart, barChart, moodDots, habitBars, moodCorrelation, sleepDots, hoursBars, effectBars, sleepCorrelation,
  eventStrip,
} from '../charts.js';
import { esc, safeColor, fmtShort, fmtDay, fmtNum, pct, cap, MONTHS, DAY_SHORT } from '../ui.js';

const PERIODS = [['settimana', 'Settimana'], ['mese', 'Mese'], ['6mesi', '6 mesi'], ['anno', 'Anno']];
const monthYear = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
let period = 'settimana';
let anchor = null;                        // a day inside the shown period; null = the current one
let effect = 'mood';                      // outcome compared in "Da cosa dipendono umore e sonno"

const EFFECTS = [['mood', 'Umore'], ['sleep', 'Sonno'], ['hours', 'Ore']];
const EFFECT = {
  sleep: { span: 1, unit: '', count: 'notti', intro: 'Qualità del sonno la notte dopo i giorni con l’abitudine fatta o l’evento successo, rispetto ai giorni senza.' },
  hours: { span: 1, unit: ' h', count: 'notti', intro: 'Ore dormite la notte dopo i giorni con l’abitudine fatta o l’evento successo, rispetto ai giorni senza.' },
  mood: { span: 1.5, unit: '', count: 'giorni', intro: 'Umore nei giorni con l’abitudine fatta o l’evento successo, rispetto ai giorni senza. In grigio le differenze piccole.' },
};
const wide = matchMedia('(min-width: 1000px)');   // two columns (style.css)
let refreshStats = null;
let resizeTimer = 0;
// Column widths change with the window: refill the rows (only on wide screens, not on every mobile URL-bar resize).
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (wide.matches && document.querySelector('.stats-grid')) refreshStats?.();
  }, 200);
});
wide.addEventListener('change', () => document.querySelector('.stats-grid') && refreshStats?.());

const fmt1 = (n) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 });
const signed = (n) => {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${fmt1(Math.abs(r))}`;
};

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

function moodSection(doc, kind, r, stats, labels, today, grow) {
  const end = r.to < today ? r.to : today;
  const s = moodStats(doc, r.from, end);
  if (!s.days) {
    return `<section class="card st-wide"><h2>Umore</h2>
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
  const moodAria = 'Completamento medio delle abitudini per livello di umore';
  grow.mood = (h) => moodDots(moodPts, 'Umore nel periodo', { height: h });
  grow.moodhab = (h) => moodCorrelation(levels, MOOD_LABELS, moodAria, h);
  const evPts = single ? stats.map((b, i) => {
    const names = eventsOn(doc, b.from).map((e) => e.name);
    return { n: names.length, tip: `${labels[i].tip} · ${names.length ? names.join(', ') : 'nessun evento'}` };
  }) : [];
  const evStrip = evPts.some((p) => p.n)
    ? `<p class="chart-sub">Eventi</p>${eventStrip(evPts, 'Giorni con eventi nel periodo')}` : '';
  return `<section class="card" data-grow="mood"><h2>Umore</h2>
      ${moodDots(moodPts, 'Umore nel periodo')}
      ${evStrip}
      <p class="chart-sub">Abitudini completate</p>
      ${habitBars(habitPts, 'Abitudini completate nel periodo')}
      ${compare ? `<p class="mood-compare">${compare}</p>` : ''}
    </section>
    <section class="card" data-grow="moodhab"><h2>Umore e abitudini</h2>
      ${enough ? `<p class="muted chart-note">Ogni puntino tenue è un giorno; quello pieno è la media per livello di umore.</p>
        ${moodCorrelation(levels, MOOD_LABELS, moodAria)}`
    : '<p class="muted">Servono almeno due giorni con umore registrato per confrontarli.</p>'}
      ${s.feelings.length ? `<p class="muted mood-sub">Emozioni più frequenti</p><div class="chips">${top(s.feelings)}</div>` : ''}
      ${s.factors.length ? `<p class="muted mood-sub">Cosa influisce di più</p><div class="chips">${top(s.factors)}</div>` : ''}
    </section>`;
}

function sleepSection(kind, doc, r, stats, labels, today, grow) {
  const end = r.to < today ? r.to : today;
  const [all] = bucketStats(doc, [{ from: r.from, to: end }], today);
  if (!all.nights) {
    return `<section class="card st-wide"><h2>Sonno</h2>
      <p class="muted">Nessuna notte registrata in questo periodo. Registrala dalla schermata Oggi: qui vedrai come dormi
      e quali abitudini ti aiutano.</p></section>`;
  }
  const single = kind === 'settimana' || kind === 'mese';
  const nights = (n) => `${n} ${n === 1 ? 'notte' : 'notti'}`;
  const quality = stats.map((b, i) => ({
    sleep: b.sleep,
    label: labels[i].label,
    tip: b.sleep == null ? `${labels[i].tip} · nessuna notte registrata`
      : `${labels[i].tip} · ${SLEEP_LABELS[Math.round(b.sleep) - 1]}${single ? '' : ` in media (${nights(b.nights)})`}`,
  }));
  const hours = stats.map((b, i) => ({
    hours: b.hours,
    label: labels[i].label,
    tip: `${labels[i].tip} · ${b.hours == null ? 'ore non registrate' : `${fmt1(b.hours)} h${single ? '' : ' in media'}`}`,
  }));
  const avg = [`<b>${SLEEP_LABELS[Math.round(all.sleep) - 1]}</b>`, all.hours == null ? '' : `<b>${fmt1(all.hours)} h</b>`]
    .filter(Boolean).join(' · ');
  grow.sleep = (h) => sleepDots(quality, 'Qualità del sonno nel periodo', { withLabels: all.hours == null, height: h });
  return `<section class="card" data-grow="sleep"><h2>Sonno</h2>
      <p class="mood-compare">In media: ${avg} (${nights(all.nights)})</p>
      ${sleepDots(quality, 'Qualità del sonno nel periodo', { withLabels: all.hours == null })}
      ${all.hours == null ? '' : `<p class="chart-sub">Ore dormite</p>${hoursBars(hours, 'Ore dormite nel periodo')}`}
    </section>
    ${sleepHabitsCard(doc, r.from, end, grow)}`;
}

/** Each night against the habits of the day before: do better days come before better nights? */
function sleepHabitsCard(doc, from, to, grow) {
  const levels = sleepByLevel(doc, from, to);
  const enough = levels.reduce((n, l) => n + l.values.length, 0) >= 2;
  const aria = 'Abitudini completate il giorno prima, per qualità del sonno';
  grow.sleephab = (h) => sleepCorrelation(levels, SLEEP_LABELS, aria, h);
  return `<section class="card" data-grow="sleephab"><h2>Sonno e abitudini</h2>
      ${enough ? `<p class="muted chart-note">Ogni puntino tenue è una notte, con le abitudini completate il giorno prima;
        quello pieno è la media per livello di sonno.</p>
        ${sleepCorrelation(levels, SLEEP_LABELS, aria)}`
    : '<p class="muted">Servono almeno due notti registrate per confrontarle con le abitudini del giorno prima.</p>'}
    </section>`;
}

function effectsSection(kind, doc, r, today) {
  const end = r.to < today ? r.to : today;
  const e = EFFECT[effect];
  const rows = habitEffects(doc, r.from, end, effect);
  const seg = EFFECTS.map(([v, label]) => `<label class="pick"><input type="radio" name="effect" value="${v}"
    ${effect === v ? 'checked' : ''}><span>${label}</span></label>`).join('');
  const tip = (x) => `${effect === 'mood' ? 'Nei giorni' : 'Dopo i giorni'} con ${x.item.name}: ${fmt1(x.with)}${e.unit}`
    + ` (${x.nWith} ${e.count}) · senza: ${fmt1(x.without)}${e.unit} (${x.nWithout} ${e.count})`;
  const body = rows.length
    ? effectBars(rows, { span: e.span, value: (d) => signed(d) + e.unit, tip })
    : `<p class="muted">Servono almeno 3 giorni con un’abitudine fatta o un evento successo e 3 senza, con
      ${effect === 'mood' ? 'l’umore' : 'il sonno'} registrato.${kind === 'settimana' ? ' Prova Mese o 6 mesi.' : ''}</p>`;
  return `<section class="card st-effects"><h2>Da cosa dipendono umore e sonno</h2>
      <div class="seg effect-seg">${seg}</div>
      <p class="muted chart-note">${e.intro}</p>
      ${body}
      <p class="muted eff-foot">È una correlazione, non per forza una causa.</p>
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
      <span class="badge" style="--c:${safeColor(h.color)}">${esc(h.emoji || '')}</span>
      <span style="flex:1"><b>${esc(h.name)}</b><small>30 giorni: ${pct(last30(doc, h, today))}</small></span>
      <span class="stat-meta">🔥 ${currentStreak(doc, h, today)} ${unit}<br>record ${bestStreak(doc, h, today)}</span></a></li>`;
  }).join('');

  const grow = {};                        // card → (height) => its main chart, taller
  el.innerHTML = `
    <header class="top"><h1>Statistiche</h1></header>
    <div class="seg period-seg">${seg}</div>
    <div class="period-nav">
      <button class="icon-btn" data-act="prev" aria-label="Periodo precedente">‹</button>
      <b>${periodTitle(period, r)}</b>
      <button class="icon-btn" data-act="next" aria-label="Periodo successivo" ${canNext ? '' : 'disabled'}>›</button>
    </div>
    <div class="stats-grid">
    <section class="card"><h2>Completamento</h2>
      ${lineChart(trend, 'var(--accent)', 'Percentuale di abitudini completate nel periodo', { shade: true })}
    </section>
    <section class="card" data-grow="heat"><h2>Ultimi 12 mesi</h2>${heatmap((k) => dayPercent(doc, k), 'var(--accent)', today)}</section>
    ${moodSection(doc, period, r, stats, labels, today, grow)}
    ${sleepSection(period, doc, r, stats, labels, today, grow)}
    ${effectsSection(period, doc, r, today)}
    <div class="st-habits"><h2 class="list-title">Per abitudine</h2>
    <ul class="card list rows">${rows}</ul></div>
    </div>`;

  el.onchange = (e) => {
    if (e.target.name === 'effect') {
      effect = e.target.value;
      refresh();
      return;
    }
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
  refreshStats = refresh;
  fillRows(el, grow);
  scrollHeatmaps(el);
}

/** Wide screens: the shorter card of each row grows its main chart until it ends level with its neighbour. */
function fillRows(el, grow) {
  if (!wide.matches) return;
  for (const card of el.querySelectorAll('.stats-grid > [data-grow]')) {
    const svg = card.querySelector('svg.chart');
    const last = card.lastElementChild;
    if (!svg || !last) continue;
    const cs = getComputedStyle(card);
    const end = last.getBoundingClientRect().bottom + parseFloat(getComputedStyle(last).marginBottom);
    const slack = card.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth) - end;
    if (slack < 6) continue;
    const box = svg.getBoundingClientRect();
    if (card.dataset.grow === 'heat') {                // bigger squares (fewer weeks in view, the rest scrolls)
      svg.style.height = `${box.height + slack}px`;
      svg.style.width = 'auto';
      continue;
    }
    const vb = svg.viewBox.baseVal;
    svg.outerHTML = grow[card.dataset.grow](vb.height + (slack * vb.width) / box.width);
  }
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
    <div class="top"><span class="badge" style="--c:${c}">${esc(h.emoji || '')}</span>
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
