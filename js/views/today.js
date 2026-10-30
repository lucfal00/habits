// "Oggi": log the habits of the selected day, skip / pause handling, sleep and mood cards.
import {
  activeHabits, isScheduled, isPaused, isSkipped, valueOf, fraction, weekCount, dayPercent, currentStreak,
  addDays, stepOf, nudge, vacationOn, moodOf, MOOD_LABELS, sleepOf, SLEEP_LABELS, noteOf,
} from '../logic.js';
import { setEntry, setSkip, setNote, NOTE_MAX, endVacation, exportBackup, getSync } from '../store.js';
import { ring } from '../charts.js';
import { animateShapes } from '../anim.js';
import { esc, safeColor, fmtDay, fmtNum, pct, parseNum } from '../ui.js';

const WEEK_MS = 7 * 864e5;
const DAYS_AHEAD = 7;                 // future days can be looked at (and noted), not logged
let day = null;
let seenToday = null;
let noteOpen = null;                 // habit id whose note editor is open

/** Tapping the name opens the day's note; a saved note shows under the card. */
function infoAndNote(doc, h, small) {
  const note = noteOf(doc, day, h.id);
  const info = `<div class="info" data-act="note" role="button" tabindex="0" aria-expanded="${noteOpen === h.id}"
    aria-label="Nota per ${esc(h.name)}"><b>${esc(h.name)}${note ? ' <span class="note-mark" aria-hidden="true">✎</span>' : ''}</b><small>${small}</small></div>`;
  const below = noteOpen === h.id
    ? `<textarea class="note-edit" data-act="note-text" maxlength="${NOTE_MAX}" rows="2"
        placeholder="Una nota su questo giorno (es. com’è andata)" aria-label="Nota per ${esc(h.name)}">${esc(note)}</textarea>`
    : note ? `<p class="note-line" data-act="note">${esc(note)}</p>` : '';
  return [info, below];
}

function card(doc, h, today) {
  const c = safeColor(h.color);
  if (isSkipped(doc, h, day)) {
    const [info, below] = infoAndNote(doc, h, '⏭ Saltata · la serie è al sicuro');
    return `<li class="habit card skipped" style="--c:${c}" data-id="${esc(h.id)}">
      <div class="ring-wrap">${ring(0, c, 46, 5)}<span class="emoji">${esc(h.emoji || '•')}</span></div>
      ${info}
      <button class="btn small" data-act="unskip">Ripristina</button>${below}
    </li>`;
  }
  const v = valueOf(doc, day, h.id);
  const f = fraction(h, v);
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
  const skip = done ? '' : `<button class="skip" data-act="skip" aria-label="Salta ${esc(h.name)} oggi" title="Salta oggi">⏭</button>`;
  const [info, below] = infoAndNote(doc, h, sub.join(' · ') || '&nbsp;');
  return `<li class="habit card${done ? ' done' : ''}" style="--c:${c}" data-id="${esc(h.id)}">
    <div class="ring-wrap">${ring(f, c, 46, 5)}<span class="emoji">${esc(h.emoji || '•')}</span></div>
    ${info}
    <div class="controls"${day > today ? ' inert' : ''}>${skip}${control}</div>${below}
  </li>`;
}

/** Sleep (the night before) and mood side by side, each with its living shape. */
function journalCards(doc, future) {
  const s = sleepOf(doc, day);
  const m = moodOf(doc, day);
  const sleepSub = s
    ? [SLEEP_LABELS[s.q - 1], Number.isFinite(s.h) ? `${fmtNum(s.h)} h` : ''].filter(Boolean).join(' · ')
    : 'Com’è andata la notte?';
  const moodSub = m ? MOOD_LABELS[m.mood - 1] : 'Com’è andata la giornata?';
  return `<div class="journal-row">
    <button class="card mood-card" data-act="sleep"${future ? ' disabled' : ''}>
      <canvas data-sleep="${s ? s.q : 0}" width="44" height="44" aria-hidden="true"></canvas>
      <span class="grow"><b>Sonno</b><small>${esc(sleepSub)}</small></span>
    </button>
    <button class="card mood-card" data-act="mood"${future ? ' disabled' : ''}>
      <canvas data-mood="${m ? m.mood : 0}" width="44" height="44" aria-hidden="true"></canvas>
      <span class="grow"><b>Umore</b><small>${esc(moodSub)}</small></span>
    </button>
  </div>`;
}

export function render(el, { doc, today, refresh }) {
  if (seenToday !== today) {
    day = today;
    seenToday = today;
    noteOpen = null;
  }
  const future = day > today;
  const all = activeHabits(doc);
  const list = all.filter((h) => (h.freq.kind === 'weekly' ? h.start <= day && !isPaused(h, day) : isScheduled(h, day)));
  const paused = all.filter((h) => h.start <= day && isPaused(h, day)).length;
  const due = list.filter((h) => !isSkipped(doc, h, day));
  const daily = due.filter((h) => h.freq.kind !== 'weekly');
  const doneCount = daily.filter((h) => fraction(h, valueOf(doc, day, h.id)) >= 1).length;
  const p = dayPercent(doc, day);
  const title = day === today ? 'Oggi' : day === addDays(today, -1) ? 'Ieri' : day === addDays(today, 1) ? 'Domani'
    : fmtDay(day).split(' ')[0];
  const vacation = vacationOn(doc, day);
  // With sync connected the data already lives on the Gist: no reminder.
  const lastBackup = doc.settings.lastBackup || 0;
  const backupDue = all.length && !getSync().connected && Date.now() - lastBackup > WEEK_MS;

  let body;
  if (!all.length) {
    body = `<div class="card empty"><p>Nessuna abitudine ancora.</p>
      <a class="btn primary" href="#abitudini/nuova">+ Crea la prima abitudine</a></div>`;
  } else if (!list.length) {
    body = `<div class="card empty"><p class="muted">${paused ? 'Tutte le abitudini di questo giorno sono in pausa.' : 'Nessuna abitudine prevista per questo giorno.'}</p></div>`;
  } else {
    body = `<section class="card summary">
        <div class="ring-wrap">${ring(p ?? 0, 'var(--accent)', 84, 9)}<span class="pct">${pct(p)}</span></div>
        <div><b>${doneCount} di ${daily.length} completate</b>
        <small>${daily.length ? 'abitudini giornaliere di questo giorno' : 'solo abitudini settimanali'}</small></div>
      </section>
      ${future ? '<p class="muted paused-note">Giorno futuro: potrai segnarle quel giorno. Le note invece puoi già scriverle.</p>' : ''}
      <ul class="habit-list${future ? ' future' : ''}">${list.map((h) => card(doc, h, today)).join('')}</ul>`;
  }
  const pausedNote = paused && list.length && !vacation
    ? `<p class="muted paused-note">⏸ ${paused === 1 ? '1 abitudine in pausa' : `${paused} abitudini in pausa`}</p>` : '';

  el.innerHTML = `
    <header class="top">
      <button class="icon-btn" data-act="prev" aria-label="Giorno precedente">‹</button>
      <div class="grow"><h1>${title}</h1><small>${fmtDay(day)}</small></div>
      ${day !== today ? '<button class="btn small today-btn" data-act="today" aria-label="Torna a oggi">Oggi</button>' : ''}
      <button class="icon-btn" data-act="next" aria-label="Giorno successivo" ${day >= addDays(today, DAYS_AHEAD) ? 'disabled' : ''}>›</button>
    </header>
    ${vacation ? `<div class="card notice vacation"><p>🏖️ In vacanza fino a ${fmtDay(vacation).toLowerCase()}: le serie sono al sicuro.</p>
      ${day === today ? '<button class="btn" data-act="endvac">Termina</button>' : ''}</div>` : ''}
    ${backupDue && lastBackup ? `<div class="card notice"><p>Non fai un backup da più di 7 giorni.</p>
      <button class="btn" data-act="backup">Esporta</button></div>` : ''}
    ${backupDue && !lastBackup ? `<div class="card notice"><p>I tuoi dati sono solo su questo dispositivo:
      collega la sincronizzazione o esporta un backup.</p>
      <a class="btn" href="#impostazioni">Impostazioni</a></div>` : ''}
    ${journalCards(doc, future)}
    ${body}
    ${pausedNote}`;
  animateShapes(el);

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    const act = b.dataset.act;
    if (act === 'prev' || act === 'next' || act === 'today') {
      day = act === 'today' ? today : addDays(day, act === 'prev' ? -1 : 1);
      if (day > addDays(today, DAYS_AHEAD)) day = addDays(today, DAYS_AHEAD);
      noteOpen = null;
      refresh();
      return;
    }
    if (act === 'mood' || act === 'sleep') {
      location.hash = `#${act === 'mood' ? 'umore' : 'sonno'}/${day}`;
      return;
    }
    if (act === 'endvac') {
      endVacation(today);
      return;
    }
    if (act === 'backup') {
      try { await exportBackup(); } catch { /* the user can retry from Impostazioni */ }
      return;
    }
    const id = b.closest('[data-id]')?.dataset.id;
    const h = id && doc.habits.find((x) => x.id === id);
    if (!h) return;
    if (act === 'note') {
      noteOpen = noteOpen === id ? null : id;
      refresh();
      if (noteOpen) el.querySelector(`[data-id="${CSS.escape(id)}"] .note-edit`)?.focus();
      return;
    }
    if (act === 'note-text' || day > today) return;
    const v = valueOf(doc, day, id);
    if (act === 'toggle') setEntry(day, id, v >= 1 ? 0 : 1);
    if (act === 'inc') setEntry(day, id, nudge(v, stepOf(h), 1));
    if (act === 'dec') setEntry(day, id, nudge(v, stepOf(h), -1));
    if (act === 'skip') setSkip(day, id, true);
    if (act === 'unskip') setSkip(day, id, false);
  };

  el.onkeydown = (e) => {
    if (e.target.dataset.act === 'note' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.target.click();
    }
  };

  el.onchange = (e) => {
    if (e.target.dataset.act === 'note-text') {
      noteOpen = null;
      setNote(day, e.target.closest('[data-id]').dataset.id, e.target.value);
      return;
    }
    if (e.target.dataset.act !== 'set') return;
    const id = e.target.closest('[data-id]').dataset.id;
    const v = parseNum(e.target.value);
    setEntry(day, id, Number.isFinite(v) ? v : 0);
  };
}
