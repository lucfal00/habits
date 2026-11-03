// "Oggi": log the habits of the selected day, skip / pause handling, sleep and mood cards.
import {
  activeHabits, isScheduled, isPaused, isSkipped, valueOf, fraction, weekCount, dayPercent, currentStreak,
  addDays, weekStart, stepOf, nudge, vacationOn, moodOf, MOOD_LABELS, sleepOf, SLEEP_LABELS, activeEvents, happenedOn,
} from '../logic.js';
import { setEntry, setSkip, setHappened, endVacation, exportBackup, getSync } from '../store.js';
import { ring } from '../charts.js';
import { animateShapes } from '../anim.js';
import { esc, safeColor, fmtDay, fmtNum, parseNum, icon, freqLabel, DAY_LETTERS } from '../ui.js';

const WEEK_MS = 7 * 864e5;
const DAYS_AHEAD = 7;                 // future days can be looked at, not logged
const SWIPE_SKIP = 72;                // px to the left that skip a habit
let day = null;
let seenToday = null;
let eventsOpen = false;
const notesOpen = new Set();         // habits whose note is shown (tap on the name)

/** Name and subtitle, plus the habit's own note (set in Abitudini) under the card. */
function infoAndNote(h, small) {
  if (!h.note) return [`<div class="info"><b>${esc(h.name)}</b><small>${small}</small></div>`, ''];
  const open = notesOpen.has(h.id);
  const info = `<div class="info" data-act="note" role="button" tabindex="0" aria-expanded="${open}"
    title="Mostra la nota"><b>${esc(h.name)}${icon('pencil', 'note-mark')}</b><small>${small}</small></div>`;
  return [info, open ? `<p class="habit-note">${esc(h.note)}</p>` : ''];
}

function card(doc, h, today) {
  const c = safeColor(h.color);
  if (isSkipped(doc, h, day)) {
    const [info, below] = infoAndNote(h, 'Saltata · la serie è al sicuro');
    return `<li class="habit skipped" style="--c:${c}" data-id="${esc(h.id)}"><div class="habit-in">
      <div class="ring-wrap">${ring(0, c, 40, 3)}<span class="emoji">${esc(h.emoji || '')}</span></div>
      ${info}
      <button class="btn small" data-act="unskip">Ripristina</button>${below}
    </div></li>`;
  }
  const v = valueOf(doc, day, h.id);
  const f = fraction(h, v);
  const done = f >= 1;
  const future = day > today;
  const sub = [];
  if (h.type === 'quantity' && h.unit) sub.push(esc(h.unit));
  if (h.freq.kind === 'weekly') sub.push(`${weekCount(doc, h, day)}/${h.freq.times} questa settimana`);
  const streak = currentStreak(doc, h, today);
  if (streak > 0) sub.push(`serie ${streak}`);
  const control = h.type === 'check'
    ? `<button class="check${done ? ' on' : ''}" data-act="toggle" aria-pressed="${done}" aria-label="Segna ${esc(h.name)} come fatta">${icon('check')}</button>`
    : `<label class="qty${done ? ' on' : ''}"><input type="text" inputmode="decimal" value="${fmtNum(v)}" data-act="set"
        aria-label="Valore ${esc(h.name)}" size="3"><small>/${fmtNum(h.target)}</small></label>
      <button class="plus" data-act="inc" aria-label="Aggiungi ${fmtNum(stepOf(h))} a ${esc(h.name)}">${icon('plus')}</button>`;
  // Skipping is a swipe to the left; the button stays for the keyboard and screen readers.
  const skip = done || future ? '' : `<button class="skip sr-focus" data-act="skip">Salta ${esc(h.name)} oggi</button>`;
  const [info, below] = infoAndNote(h, sub.join(' · ') || esc(freqLabel(h)));
  return `<li class="habit${done ? ' done' : ''}" style="--c:${c}" data-id="${esc(h.id)}"${done || future ? '' : ' data-swipe'}>
    <div class="swipe-act" aria-hidden="true">${icon('skip')} Salta</div>
    <div class="habit-in">
      <div class="ring-wrap">${ring(f, c, 40, 3)}<span class="emoji">${esc(h.emoji || '')}</span></div>
      ${info}
      <div class="controls"${future ? ' inert' : ''}>${skip}${control}</div>${below}
    </div>
  </li>`;
}

/** Monday–Sunday around the selected day, each with a small completion ring; tap to go to a day. */
function weekStrip(doc, today) {
  const start = weekStart(day);
  const last = addDays(today, DAYS_AHEAD);
  const days = DAY_LETTERS.map((letter, i) => {
    const k = addDays(start, i);
    const cls = [k === day && 'on', k > today && 'fut', k === today && 'today'].filter(Boolean).join(' ');
    return `<button class="wd ${cls}" data-act="go" data-day="${k}" ${k > last ? 'disabled' : ''}
      aria-label="${fmtDay(k)}"${k === day ? ' aria-current="date"' : ''}>
      <span>${letter}</span>${ring(k > today ? 0 : dayPercent(doc, k) ?? 0, 'var(--accent)', 22, 2.5)}<b>${+k.slice(8)}</b></button>`;
  }).join('');
  return `<nav class="week" aria-label="Giorni della settimana">
    <button class="week-nav" data-act="prev" aria-label="Settimana precedente">${icon('left')}</button>
    <div class="week-days">${days}</div>
    <button class="week-nav" data-act="next" aria-label="Settimana successiva" ${addDays(start, 7) > last ? 'disabled' : ''}>${icon('right')}</button>
  </nav>`;
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
      <canvas data-sleep="${s ? s.q : 0}" width="52" height="52" aria-hidden="true"></canvas>
      <span class="grow"><b>Sonno</b><small>${esc(sleepSub)}</small></span>
    </button>
    <button class="card mood-card" data-act="mood"${future ? ' disabled' : ''}>
      <canvas data-mood="${m ? m.mood : 0}" width="52" height="52" aria-hidden="true"></canvas>
      <span class="grow"><b>Umore</b><small>${esc(moodSub)}</small></span>
    </button>
  </div>`;
}

/** Habit-sized box above the habits; tap to open the chips of every event. */
function eventsCard(doc) {
  const list = activeEvents(doc);
  const label = (e) => `${e.icon ? `${e.icon} ` : ''}${e.name}`;
  const on = list.filter((e) => happenedOn(doc, day, e.id));
  const summary = on.length ? on.map(label).join(' · ')
    : list.length ? 'Niente di particolare' : 'Tè, amici, una visita: segna cosa succede';
  const chips = eventsOpen ? `<div class="ev-chips">${list.map((e) => {
    const yes = happenedOn(doc, day, e.id);
    return `<button class="ev-chip${yes ? ' on' : ''}" data-act="event" data-ev="${esc(e.id)}" aria-pressed="${yes}">${esc(label(e))}</button>`;
  }).join('')}<a class="ev-chip add" href="#abitudini/evento">+ Nuovo</a></div>` : '';
  return `<section class="card events-card${eventsOpen ? ' open' : ''}">
    <button class="ev-head" data-act="events" aria-expanded="${eventsOpen}">
      <span class="ev-icon">${icon('sparkles')}</span>
      <span class="grow"><b>Eventi</b><small>${esc(summary)}</small></span>
      ${icon('down', 'chev')}
    </button>${chips}
  </section>`;
}

/** Swipe a habit row to the left to skip it (pointer events: touch, pen and mouse). */
function bindSwipe(el, onSkip) {
  let drag = null;
  let swiped = false;
  el.onpointerdown = (e) => {
    const li = e.target.closest('.habit[data-swipe]');
    if (!li || e.button > 0 || e.target.closest('button, input, label')) return;
    drag = { li, row: li.querySelector('.habit-in'), x: e.clientX, y: e.clientY, dx: 0, on: false };
  };
  el.onpointermove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.on) {
      if (Math.abs(e.clientY - drag.y) > 10) { drag = null; return; }       // a vertical scroll
      if (dx > -10) return;
      drag.on = true;
      drag.li.classList.add('swiping');
      drag.li.setPointerCapture?.(e.pointerId);
    }
    drag.dx = Math.max(-120, Math.min(0, dx));
    drag.row.style.transform = `translateX(${drag.dx}px)`;
    drag.li.classList.toggle('armed', drag.dx <= -SWIPE_SKIP);
  };
  el.onpointerup = el.onpointercancel = (e) => {
    if (!drag) return;
    const { li, row, dx, on } = drag;
    drag = null;
    if (!on) return;
    swiped = true;                                   // the click that follows right away is not a tap
    setTimeout(() => { swiped = false; }, 60);
    li.classList.remove('swiping');
    if (dx <= -SWIPE_SKIP && e.type === 'pointerup') onSkip(li.dataset.id);
    else row.style.transform = '';
  };
  return () => {
    const was = swiped;
    swiped = false;
    return was;
  };
}

export function render(el, { doc, today, refresh }) {
  if (seenToday !== today) {
    day = today;
    seenToday = today;
  }
  const future = day > today;
  const all = activeHabits(doc);
  const list = all.filter((h) => (h.freq.kind === 'weekly' ? h.start <= day && !isPaused(h, day) : isScheduled(h, day)));
  const paused = all.filter((h) => h.start <= day && isPaused(h, day)).length;
  const due = list.filter((h) => !isSkipped(doc, h, day));
  const daily = due.filter((h) => h.freq.kind !== 'weekly');
  const doneCount = daily.filter((h) => fraction(h, valueOf(doc, day, h.id)) >= 1).length;
  const p = Math.round((dayPercent(doc, day) ?? 0) * 100);
  const title = day === today ? 'Oggi' : day === addDays(today, -1) ? 'Ieri' : day === addDays(today, 1) ? 'Domani'
    : fmtDay(day).split(' ')[0];
  const vacation = vacationOn(doc, day);
  // With sync connected the data already lives on the Gist: no reminder.
  const lastBackup = doc.settings.lastBackup || 0;
  const backupDue = all.length && !getSync().connected && Date.now() - lastBackup > WEEK_MS;
  const neverSkipped = !Object.values(doc.entries).some((row) => Object.values(row).some((x) => x.s === 1));

  let body;
  if (!all.length) {
    body = `<div class="card empty"><p>Nessuna abitudine ancora.</p>
      <a class="btn primary" href="#abitudini/nuova">+ Crea la prima abitudine</a></div>`;
  } else if (!list.length) {
    body = `<div class="card empty"><p class="muted">${paused ? 'Tutte le abitudini di questo giorno sono in pausa.' : 'Nessuna abitudine prevista per questo giorno.'}</p></div>`;
  } else {
    body = `<div class="sec-row"><p class="sec">Abitudini</p>
        <span>${daily.length ? `${doneCount} di ${daily.length}` : 'settimanali'}</span></div>
      <div class="progress" role="progressbar" aria-label="Completamento del giorno" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${p}"><i style="width:${p}%"></i></div>
      ${future ? '<p class="muted paused-note">Giorno futuro: potrai segnarle quel giorno.</p>' : ''}
      <ul class="card habit-list${future ? ' future' : ''}">${list.map((h) => card(doc, h, today)).join('')}</ul>
      ${neverSkipped && !future ? '<p class="muted paused-note">Scorri un’abitudine verso sinistra per saltarla oggi.</p>' : ''}`;
  }
  const pausedNote = paused && list.length && !vacation
    ? `<p class="muted paused-note">${paused === 1 ? '1 abitudine in pausa' : `${paused} abitudini in pausa`}</p>` : '';

  el.innerHTML = `
    <header class="top">
      <div class="grow"><h1>${title}</h1><small>${fmtDay(day)}</small></div>
      ${day !== today ? '<button class="btn small today-btn" data-act="today" aria-label="Torna a oggi">Oggi</button>' : ''}
    </header>
    ${weekStrip(doc, today)}
    ${vacation ? `<div class="card notice vacation"><p>In vacanza fino a ${fmtDay(vacation).toLowerCase()}: le serie sono al sicuro.</p>
      ${day === today ? '<button class="btn" data-act="endvac">Termina</button>' : ''}</div>` : ''}
    ${backupDue && lastBackup ? `<div class="card notice"><p>Non fai un backup da più di 7 giorni.</p>
      <button class="btn" data-act="backup">Esporta</button></div>` : ''}
    ${backupDue && !lastBackup ? `<div class="card notice"><p>I tuoi dati sono solo su questo dispositivo:
      collega la sincronizzazione o esporta un backup.</p>
      <a class="btn" href="#impostazioni">Impostazioni</a></div>` : ''}
    ${journalCards(doc, future)}
    ${future ? '' : eventsCard(doc)}
    ${body}
    ${pausedNote}`;
  animateShapes(el);

  const wasSwipe = bindSwipe(el, (id) => setSkip(day, id, true));

  el.onclick = async (e) => {
    if (wasSwipe()) return;
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    const act = b.dataset.act;
    if (act === 'prev' || act === 'next' || act === 'today' || act === 'go') {
      day = act === 'today' ? today : act === 'go' ? b.dataset.day : addDays(day, act === 'prev' ? -7 : 7);
      if (day > addDays(today, DAYS_AHEAD)) day = addDays(today, DAYS_AHEAD);
      refresh();
      return;
    }
    if (act === 'events') {
      eventsOpen = !eventsOpen;
      refresh();
      return;
    }
    if (act === 'event') {
      setHappened(day, b.dataset.ev, !happenedOn(doc, day, b.dataset.ev));
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
      if (!notesOpen.delete(id)) notesOpen.add(id);
      refresh();
      return;
    }
    if (day > today) return;
    const v = valueOf(doc, day, id);
    if (act === 'toggle') setEntry(day, id, v >= 1 ? 0 : 1);
    if (act === 'inc') setEntry(day, id, nudge(v, stepOf(h), 1));
    if (act === 'skip') setSkip(day, id, true);
    if (act === 'unskip') setSkip(day, id, false);
  };

  el.onkeydown = (e) => {
    if (e.target.dataset?.act === 'note' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.target.click();
    }
  };

  el.onchange = (e) => {
    if (e.target.dataset.act !== 'set') return;
    const id = e.target.closest('[data-id]').dataset.id;
    const v = parseNum(e.target.value);
    setEntry(day, id, Number.isFinite(v) ? v : 0);
  };
}
