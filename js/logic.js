// Pure logic: dates, schedule, streaks, percentages, backup merge.
// No DOM, no storage. Dates are local 'YYYY-MM-DD' keys (string order = date order).

const pad = (n) => String(n).padStart(2, '0');

// ---- Dates -------------------------------------------------------------

export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = (now = new Date()) => toKey(now);

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** 1 = Monday … 7 = Sunday */
export const weekday = (key) => fromKey(key).getDay() || 7;

export const weekStart = (key) => addDays(key, 1 - weekday(key));

export const monthStart = (key) => key.slice(0, 8) + '01';

export function monthEnd(key) {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Start of the month n months away from key's month. */
export function addMonths(key, n) {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

function* days(from, to) {
  for (let k = from; k <= to; k = addDays(k, 1)) yield k;
}

// ---- Document ----------------------------------------------------------

export function emptyDoc() {
  return { version: 1, habits: [], entries: {}, settings: { theme: 'auto', lastBackup: 0 } };
}

export const isActive = (h) => !h.archived && !h.deleted;

export const activeHabits = (doc) => doc.habits.filter(isActive).sort((a, b) => a.order - b.order);

export const targetOf = (h) => (h.type === 'quantity' ? h.target : 1);

export const valueOf = (doc, key, id) => doc.entries[key]?.[id]?.v ?? 0;

/** Amount added/removed by the +/− buttons (quantity habits only; default 1). */
export const stepOf = (h) => (h.type === 'quantity' && h.step > 0 ? h.step : 1);

/** v ± step, rounded to avoid floating-point drift, never below zero. */
export const nudge = (v, step, dir) => Math.max(0, Math.round((v + dir * step) * 1e6) / 1e6);

// ---- Per-day -----------------------------------------------------------

export const fraction = (h, v) => Math.max(0, Math.min(v / targetOf(h), 1));

export const isDone = (h, v) => fraction(h, v) >= 1;

const isWeekly = (h) => h.freq.kind === 'weekly';

const doneOn = (doc, h, key) => isDone(h, valueOf(doc, key, h.id));

/** Weekly habits are never "scheduled" on a day: they are counted per week. */
export function isScheduled(h, key) {
  if (key < h.start) return false;
  if (h.freq.kind === 'daily') return true;
  if (h.freq.kind === 'days') return h.freq.days.includes(weekday(key));
  return false;
}

/** Days done in the Monday–Sunday week containing key. */
export function weekCount(doc, h, key) {
  const ws = weekStart(key);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDays(ws, i);
    if (k >= h.start && doneOn(doc, h, k)) n++;
  }
  return n;
}

/** Mean fraction of active habits scheduled on key; null if none. */
export function dayPercent(doc, key) {
  const hs = activeHabits(doc).filter((h) => isScheduled(h, key));
  if (!hs.length) return null;
  return hs.reduce((s, h) => s + fraction(h, valueOf(doc, key, h.id)), 0) / hs.length;
}

/** Single-habit heatmap value; null where the habit does not apply. */
export function habitDayFraction(doc, h, key) {
  if (key < h.start || (!isWeekly(h) && !isScheduled(h, key))) return null;
  return fraction(h, valueOf(doc, key, h.id));
}

// ---- Streaks -----------------------------------------------------------

const weekMet = (doc, h, ws) => weekCount(doc, h, ws) >= h.freq.times;

export function currentStreak(doc, h, today) {
  let n = 0;
  if (isWeekly(h)) {
    let w = weekStart(today);
    if (weekMet(doc, h, w)) n++;                    // current week pending otherwise
    const first = weekStart(h.start);
    for (w = addDays(w, -7); w >= first; w = addDays(w, -7)) {
      if (!weekMet(doc, h, w)) break;
      n++;
    }
    return n;
  }
  let k = doneOn(doc, h, today) ? today : addDays(today, -1);   // today pending
  for (; k >= h.start; k = addDays(k, -1)) {
    if (!isScheduled(h, k)) continue;
    if (!doneOn(doc, h, k)) break;
    n++;
  }
  return n;
}

export function bestStreak(doc, h, today) {
  let best = 0;
  let run = 0;
  if (isWeekly(h)) {
    for (let w = weekStart(h.start); w <= today; w = addDays(w, 7)) {
      if (weekMet(doc, h, w)) best = Math.max(best, ++run);
      else run = 0;
    }
    return best;
  }
  for (const k of days(h.start, today)) {
    if (!isScheduled(h, k)) continue;
    if (doneOn(doc, h, k)) best = Math.max(best, ++run);
    else run = 0;
  }
  return best;
}

// ---- Periods -----------------------------------------------------------

/** Achieved / expected over [from, to] ∩ [start, today]; null if nothing expected. */
export function periodPercent(doc, habits, from, to, today) {
  const end = to < today ? to : today;
  let expected = 0;
  let got = 0;
  for (const h of habits) {
    const start = from > h.start ? from : h.start;
    if (start > end) continue;
    if (isWeekly(h)) {
      let n = 0;
      let done = 0;
      for (const k of days(start, end)) {
        n++;
        if (doneOn(doc, h, k)) done++;
      }
      const e = (h.freq.times * n) / 7;
      expected += e;
      got += Math.min(done, e);
    } else {
      for (const k of days(start, end)) {
        if (!isScheduled(h, k)) continue;
        expected++;
        got += fraction(h, valueOf(doc, k, h.id));
      }
    }
  }
  return expected ? got / expected : null;
}

// ---- Backup ------------------------------------------------------------

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function validHabit(h) {
  if (!h || typeof h.id !== 'string' || typeof h.name !== 'string') return false;
  if (h.type !== 'check' && !(h.type === 'quantity' && h.target > 0)) return false;
  if (h.step !== undefined && !(h.step > 0)) return false;
  if (typeof h.start !== 'string' || !KEY_RE.test(h.start)) return false;
  const f = h.freq;
  if (!f) return false;
  if (f.kind === 'daily') return true;
  if (f.kind === 'days') return Array.isArray(f.days) && f.days.length > 0;
  if (f.kind === 'weekly') return f.times >= 1 && f.times <= 7;
  return false;
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

export function validateDoc(d) {
  if (!isObj(d) || d.version !== 1) return false;
  if (!Array.isArray(d.habits) || !d.habits.every(validHabit)) return false;
  if (!isObj(d.entries)) return false;
  return Object.entries(d.entries).every(([k, row]) => KEY_RE.test(k) && isObj(row)
    && Object.values(row).every((e) => isObj(e) && Number.isFinite(e.v)));
}

/** Merge incoming into a copy of local: per habit and per (day, habit) the newest wins. */
export function mergeDocs(local, incoming) {
  const doc = JSON.parse(JSON.stringify(local));
  let habits = 0;
  let entries = 0;
  const index = new Map(doc.habits.map((h, i) => [h.id, i]));
  for (const h of incoming.habits) {
    const i = index.get(h.id);
    if (i === undefined) {
      doc.habits.push(h);
      habits++;
    } else if ((h.updatedAt ?? 0) > (doc.habits[i].updatedAt ?? 0)) {
      doc.habits[i] = h;
      habits++;
    }
  }
  for (const [day, row] of Object.entries(incoming.entries)) {
    const dst = (doc.entries[day] ??= {});
    for (const [id, e] of Object.entries(row)) {
      if (!dst[id] || (e.t ?? 0) > (dst[id].t ?? 0)) {
        dst[id] = e;
        entries++;
      }
    }
  }
  doc.settings.lastBackup = Math.max(doc.settings.lastBackup || 0, incoming.settings?.lastBackup || 0);
  return { doc, habits, entries };
}
