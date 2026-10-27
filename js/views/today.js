// "Oggi": log the habits of the selected day.
import {
  activeHabits, isScheduled, valueOf, fraction, weekCount, dayPercent, currentStreak, addDays,
} from '../logic.js';
import { setEntry, exportBackup, getSync } from '../store.js';
import { ring } from '../charts.js';
import { esc, safeColor, fmtDay, fmtNum, pct, parseNum } from '../ui.js';

const WEEK_MS = 7 * 864e5;
let day = null;
let seenToday = null;

function card(doc, h, today) {
  const v = valueOf(doc, day, h.id);
  const f = fraction(h, v);
  const c = safeColor(h.color);
  const done = f >= 1;
  const sub = [];
  if (h.type === 'quantity') sub.push(`${fmtNum(v)} / ${fmtNum(h.target)} ${esc(h.unit)}`);
  if (h.freq.kind === 'weekly') sub.push(`${weekCount(doc, h, day)}/${h.freq.times} questa settimana`);
  const streak = currentStreak(doc, h, today);
  if (streak > 0) sub.push(`🔥 ${streak}`);
  const control = h.type === 'check'
    ? `<button class="check${done ? ' on' : ''}" data-act="toggle" aria-pressed="${done}" aria-label="Segna ${esc(h.name)} come fatta">✓</button>`
    : `<div class="stepper">
        <button data-act="dec" aria-label="Diminuisci ${esc(h.name)}">−</button>
        <input type="text" inputmode="decimal" value="${fmtNum(v)}" data-act="set" aria-label="Valore ${esc(h.name)}">
        <button data-act="inc" aria-label="Aumenta ${esc(h.name)}">+</button>
      </div>`;
  return `<li class="habit card${done ? ' done' : ''}" style="--c:${c}" data-id="${esc(h.id)}">
    <div class="ring-wrap">${ring(f, c, 46, 5)}<span class="emoji">${esc(h.emoji || '•')}</span></div>
    <div class="info"><b>${esc(h.name)}</b><small>${sub.join(' · ') || '&nbsp;'}</small></div>
    ${control}
  </li>`;
}

export function render(el, { doc, today, refresh }) {
  if (seenToday !== today) {
    day = today;
    seenToday = today;
  }
  const all = activeHabits(doc);
  const list = all.filter((h) => (h.freq.kind === 'weekly' ? h.start <= day : isScheduled(h, day)));
  const daily = list.filter((h) => h.freq.kind !== 'weekly');
  const doneCount = daily.filter((h) => fraction(h, valueOf(doc, day, h.id)) >= 1).length;
  const p = dayPercent(doc, day);
  const title = day === today ? 'Oggi' : day === addDays(today, -1) ? 'Ieri' : fmtDay(day).split(' ')[0];
  // With sync connected the data already lives on the Gist: no reminder.
  const lastBackup = doc.settings.lastBackup || 0;
  const backupDue = all.length && !getSync().connected && Date.now() - lastBackup > WEEK_MS;

  let body;
  if (!all.length) {
    body = `<div class="card empty"><p>Nessuna abitudine ancora.</p>
      <a class="btn primary" href="#abitudini/nuova">+ Crea la prima abitudine</a></div>`;
  } else if (!list.length) {
    body = '<div class="card empty"><p class="muted">Nessuna abitudine prevista per questo giorno.</p></div>';
  } else {
    body = `<section class="card summary">
        <div class="ring-wrap">${ring(p ?? 0, 'var(--accent)', 84, 9)}<span class="pct">${pct(p)}</span></div>
        <div><b>${doneCount} di ${daily.length} completate</b>
        <small>${daily.length ? 'abitudini giornaliere di questo giorno' : 'solo abitudini settimanali'}</small></div>
      </section>
      <ul class="habit-list">${list.map((h) => card(doc, h, today)).join('')}</ul>`;
  }

  el.innerHTML = `
    <header class="top">
      <button class="icon-btn" data-act="prev" aria-label="Giorno precedente">‹</button>
      <div class="grow"><h1>${title}</h1><small>${fmtDay(day)}</small></div>
      <button class="icon-btn" data-act="next" aria-label="Giorno successivo" ${day >= today ? 'disabled' : ''}>›</button>
    </header>
    ${backupDue && lastBackup ? `<div class="card notice"><p>Non fai un backup da più di 7 giorni.</p>
      <button class="btn" data-act="backup">Esporta</button></div>` : ''}
    ${backupDue && !lastBackup ? `<div class="card notice"><p>I tuoi dati sono solo su questo dispositivo:
      collega la sincronizzazione o esporta un backup.</p>
      <a class="btn" href="#impostazioni">Impostazioni</a></div>` : ''}
    ${body}`;

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    const act = b.dataset.act;
    if (act === 'prev' || act === 'next') {
      day = addDays(day, act === 'prev' ? -1 : 1);
      if (day > today) day = today;
      refresh();
      return;
    }
    if (act === 'backup') {
      try { await exportBackup(); } catch { /* the user can retry from Impostazioni */ }
      return;
    }
    const id = b.closest('[data-id]')?.dataset.id;
    const h = id && doc.habits.find((x) => x.id === id);
    if (!h) return;
    const v = valueOf(doc, day, id);
    if (act === 'toggle') setEntry(day, id, v >= 1 ? 0 : 1);
    if (act === 'inc') setEntry(day, id, v + 1);
    if (act === 'dec') setEntry(day, id, Math.max(0, v - 1));
  };

  el.onchange = (e) => {
    if (e.target.dataset.act !== 'set') return;
    const id = e.target.closest('[data-id]').dataset.id;
    const v = parseNum(e.target.value);
    setEntry(day, id, Number.isFinite(v) ? v : 0);
  };
}
