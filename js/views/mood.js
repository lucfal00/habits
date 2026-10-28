// "Umore" (#umore/<day>): morphing shape on a continuous slider, feelings, factors, note.
import { moodOf, moodBand, MOOD_LABELS } from '../logic.js';
import { setJournal, clearJournal } from '../store.js';
import { animateShapes, redraw } from '../anim.js';
import { esc, fmtDay } from '../ui.js';

const FEELINGS = {
  spiacevole: ['Stress', 'Ansia', 'Tristezza', 'Stanchezza', 'Irritazione', 'Preoccupazione', 'Solitudine', 'Frustrazione', 'Delusione'],
  neutro: ['Calma', 'Indifferenza', 'Concentrazione', 'Riflessione', 'Tranquillità', 'Noia'],
  piacevole: ['Felicità', 'Gratitudine', 'Serenità', 'Energia', 'Orgoglio', 'Entusiasmo', 'Relax', 'Fiducia', 'Amore'],
};
const FACTORS = ['Lavoro', 'Studio', 'Famiglia', 'Amici', 'Partner', 'Salute', 'Sonno', 'Sport', 'Tempo libero', 'Meteo', 'Soldi', 'Casa'];
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

let draft = null;   // { day, level, feelings: Set, factors: Set, note } kept across re-renders

const chips = (group, names, selected) => names.map((n) => `<button type="button" class="chip${selected.has(n) ? ' on' : ''}"
  data-group="${group}" data-name="${esc(n)}" aria-pressed="${selected.has(n)}">${esc(n)}</button>`).join('');

/** Suggestions for the level's band, plus anything already chosen from other bands. */
function feelingChips(d) {
  const band = moodBand(Math.round(d.level));
  const names = [...new Set([...FEELINGS[band], ...d.feelings])];
  return chips('feelings', names, d.feelings);
}

export function render(el, { doc, param, today }) {
  const day = KEY_RE.test(param) && param <= today ? param : today;
  if (!draft || draft.day !== day) {
    const m = moodOf(doc, day);
    draft = {
      day,
      level: m ? m.mood : 4,
      feelings: new Set(m?.feelings || []),
      factors: new Set(m?.factors || []),
      note: m?.note || '',
      saved: !!m,
    };
  }
  const d = draft;

  el.innerHTML = `
    <header class="top"><a class="back" href="#oggi">‹ Oggi</a></header>
    <div class="mood-head"><h1>Umore</h1><small>${fmtDay(day)}</small></div>
    <section class="mood-hero">
      <canvas class="mood-big" data-mood="${Math.round(d.level)}" width="250" height="250" aria-hidden="true"></canvas>
      <div class="mood-label" aria-live="polite">${MOOD_LABELS[Math.round(d.level) - 1]}</div>
      <input class="mood-slider" type="range" min="1" max="7" step="0.01" value="${d.level}" aria-label="Umore, da molto spiacevole a molto piacevole">
      <div class="mood-scale"><span>Molto spiacevole</span><span>Molto piacevole</span></div>
    </section>
    <section class="card"><h2>Emozioni</h2><div class="chips" data-chips="feelings">${feelingChips(d)}</div></section>
    <section class="card"><h2>Cosa influisce</h2><div class="chips">${chips('factors', FACTORS, d.factors)}</div></section>
    <section class="card"><h2>Nota</h2>
      <textarea class="mood-note" maxlength="500" rows="3" placeholder="Com’è andata la giornata?">${esc(d.note)}</textarea></section>
    <div class="btn-row mood-actions">
      <button class="btn primary" data-act="save">Salva</button>
      ${d.saved ? '<button class="btn danger" data-act="clear">Elimina</button>' : ''}
    </div>`;

  const canvas = el.querySelector('.mood-big');
  const label = el.querySelector('.mood-label');
  const slider = el.querySelector('.mood-slider');
  const feelingsBox = el.querySelector('[data-chips="feelings"]');
  let band = moodBand(Math.round(d.level));
  const setLevel = (lv) => {
    d.level = lv;
    label.textContent = MOOD_LABELS[Math.round(lv) - 1];
    const b = moodBand(Math.round(lv));
    if (b !== band) {
      band = b;
      feelingsBox.innerHTML = feelingChips(d);
    }
    canvas.level = lv;
    redraw(canvas);
  };
  canvas.level = d.level;                         // the shape follows the slider, fractional levels included
  animateShapes(el);

  el.oninput = (e) => {
    if (e.target === slider) setLevel(Number(slider.value));
    if (e.target.classList.contains('mood-note')) d.note = e.target.value;
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
    const chip = e.target.closest('.chip');
    if (chip) {
      const set = d[chip.dataset.group];
      const name = chip.dataset.name;
      if (set.has(name)) set.delete(name);
      else set.add(name);
      chip.classList.toggle('on', set.has(name));
      chip.setAttribute('aria-pressed', String(set.has(name)));
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'save') {
      draft = null;
      location.hash = '#oggi';
      setJournal(day, { mood: Math.round(d.level), feelings: [...d.feelings], factors: [...d.factors], note: d.note.trim() });
    }
    if (act === 'clear' && confirm('Eliminare l’umore di questo giorno?')) {
      draft = null;
      location.hash = '#oggi';
      clearJournal(day);
    }
  };
}
