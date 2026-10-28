// "Sonno" (#sonno/<day>): the night ending on the morning of day — wave shape on a continuous slider, hours slept.
import { sleepOf, addDays, fromKey, SLEEP_LABELS } from '../logic.js';
import { setSleep, clearSleep } from '../store.js';
import { animateShapes, redraw } from '../anim.js';
import { fmtDay, fmtNum } from '../ui.js';

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HOURS_STEP = 0.5;
const DEFAULT_HOURS = 7.5;
const weekdayFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long' });

let draft = null;   // { day, level, hours: number | null, saved } kept across re-renders

const fmtHours = (h) => (h == null ? '—' : `${fmtNum(h)} h`);

/** Hours of the most recent night that has them: the first tap on − / + starts there. */
function lastHours(doc) {
  let best = null;
  for (const [k, s] of Object.entries(doc.sleep || {})) {
    if (s.q > 0 && Number.isFinite(s.h) && (!best || k > best[0])) best = [k, s.h];
  }
  return best ? best[1] : DEFAULT_HOURS;
}

export function render(el, { doc, param, today }) {
  const day = KEY_RE.test(param) && param <= today ? param : today;
  if (!draft || draft.day !== day) {
    const s = sleepOf(doc, day);
    draft = { day, level: s ? s.q : 3, hours: Number.isFinite(s?.h) ? s.h : null, saved: !!s };
  }
  const d = draft;
  const night = `Notte tra ${weekdayFmt.format(fromKey(addDays(day, -1)))} e ${fmtDay(day).toLowerCase()}`;

  el.innerHTML = `
    <header class="top"><a class="back" href="#oggi">‹ Oggi</a></header>
    <div class="mood-head"><h1>Sonno</h1><small>${night}</small></div>
    <section class="mood-hero">
      <canvas class="mood-big" data-sleep="${Math.round(d.level)}" width="250" height="250" aria-hidden="true"></canvas>
      <div class="mood-label" aria-live="polite">${SLEEP_LABELS[Math.round(d.level) - 1]}</div>
      <input class="mood-slider sleep-slider" type="range" min="1" max="5" step="0.01" value="${d.level}"
        aria-label="Qualità del sonno, da pessimo a ottimo">
      <div class="mood-scale"><span>Pessimo</span><span>Ottimo</span></div>
    </section>
    <section class="card hours-card">
      <div class="grow"><h2>Ore dormite</h2><small class="muted">Facoltativo</small></div>
      <div class="stepper">
        <button data-act="hdec" aria-label="Meno mezz’ora">−</button>
        <output class="hours-val" aria-live="polite">${fmtHours(d.hours)}</output>
        <button data-act="hinc" aria-label="Più mezz’ora">+</button>
      </div>
      <button class="icon-btn hours-clear" data-act="hclear" aria-label="Svuota le ore" ${d.hours == null ? 'hidden' : ''}>×</button>
    </section>
    <div class="btn-row mood-actions">
      <button class="btn primary" data-act="save">Salva</button>
      ${d.saved ? '<button class="btn danger" data-act="clear">Elimina</button>' : ''}
    </div>`;

  const canvas = el.querySelector('.mood-big');
  const label = el.querySelector('.mood-label');
  const slider = el.querySelector('.mood-slider');
  const hoursVal = el.querySelector('.hours-val');
  const hoursClear = el.querySelector('.hours-clear');
  const setLevel = (lv) => {
    d.level = lv;
    label.textContent = SLEEP_LABELS[Math.round(lv) - 1];
    canvas.level = lv;
    redraw(canvas);
  };
  const setHours = (h) => {
    d.hours = h;
    hoursVal.textContent = fmtHours(h);
    hoursClear.hidden = h == null;
  };
  canvas.level = d.level;                         // the shape follows the slider, fractional levels included
  animateShapes(el);

  el.oninput = (e) => {
    if (e.target === slider) setLevel(Number(slider.value));
  };
  // On release, glide to the nearest level.
  el.onchange = (e) => {
    if (e.target !== slider) return;
    const from = d.level;
    const to = Math.round(from);
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 220);
      setLevel(from + (to - from) * (1 - (1 - t) ** 3));
      slider.value = String(d.level);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  el.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'hinc' || act === 'hdec') {
      if (d.hours == null) setHours(lastHours(doc));
      else setHours(Math.min(24, Math.max(0, d.hours + (act === 'hinc' ? HOURS_STEP : -HOURS_STEP))));
    }
    if (act === 'hclear') setHours(null);
    if (act === 'save') {
      draft = null;
      location.hash = '#oggi';
      setSleep(day, { q: Math.round(d.level), h: d.hours ?? undefined });
    }
    if (act === 'clear' && confirm('Eliminare il sonno di questa notte?')) {
      draft = null;
      location.hash = '#oggi';
      clearSleep(day);
    }
  };
}
