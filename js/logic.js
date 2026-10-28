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
  return { version: 1, habits: [], entries: {}, journal: {}, settings: { theme: 'auto', lastBackup: 0 } };
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

/** Inside one of the habit's pause periods (dates inclusive). */
export const isPaused = (h, key) => !!h.pauses?.some((p) => key >= p.from && key <= p.to);

/** "Salta oggi": the entry carries s = 1. */
export const isSkipped = (doc, h, key) => doc.entries[key]?.[h.id]?.s === 1;

/** Weekly habits are never "scheduled" on a day: they are counted per week. Paused days are not scheduled. */
export function isScheduled(h, key) {
  if (key < h.start || isPaused(h, key)) return false;
  if (h.freq.kind === 'daily') return true;
  if (h.freq.kind === 'days') return h.freq.days.includes(weekday(key));
  return false;
}

/** Scheduled and not skipped: the day counts for %, streaks and the calendar. */
export const isDue = (doc, h, key) => isScheduled(h, key) && !isSkipped(doc, h, key);

/** A day that counts for a weekly habit (started, not paused, not skipped). */
const activeDay = (doc, h, key) => key >= h.start && !isPaused(h, key) && !isSkipped(doc, h, key);

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

/** Mean fraction of active habits due on key; null if none. */
export function dayPercent(doc, key) {
  const hs = activeHabits(doc).filter((h) => isDue(doc, h, key));
  if (!hs.length) return null;
  return hs.reduce((s, h) => s + fraction(h, valueOf(doc, key, h.id)), 0) / hs.length;
}

/** Single-habit heatmap value; null where the habit does not apply (paused, skipped, not scheduled). */
export function habitDayFraction(doc, h, key) {
  if (!activeDay(doc, h, key) || (!isWeekly(h) && !isScheduled(h, key))) return null;
  return fraction(h, valueOf(doc, key, h.id));
}

// ---- Streaks -----------------------------------------------------------

/** Weekly target scaled to the active days of the week: met | missed | ignored (no active day). */
function weekStatus(doc, h, ws) {
  let active = 0;
  for (let i = 0; i < 7; i++) if (activeDay(doc, h, addDays(ws, i))) active++;
  if (!active) return 'ignored';
  return weekCount(doc, h, ws) >= Math.ceil((h.freq.times * active) / 7) ? 'met' : 'missed';
}

export function currentStreak(doc, h, today) {
  let n = 0;
  if (isWeekly(h)) {
    let w = weekStart(today);
    if (weekStatus(doc, h, w) === 'met') n++;       // current week pending otherwise
    const first = weekStart(h.start);
    for (w = addDays(w, -7); w >= first; w = addDays(w, -7)) {
      const s = weekStatus(doc, h, w);
      if (s === 'ignored') continue;
      if (s === 'missed') break;
      n++;
    }
    return n;
  }
  let k = doneOn(doc, h, today) ? today : addDays(today, -1);   // today pending
  for (; k >= h.start; k = addDays(k, -1)) {
    if (!isDue(doc, h, k)) continue;
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
      const s = weekStatus(doc, h, w);
      if (s === 'met') best = Math.max(best, ++run);
      else if (s === 'missed') run = 0;
    }
    return best;
  }
  for (const k of days(h.start, today)) {
    if (!isDue(doc, h, k)) continue;
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
        if (!activeDay(doc, h, k)) continue;
        n++;
        if (doneOn(doc, h, k)) done++;
      }
      const e = (h.freq.times * n) / 7;
      expected += e;
      got += Math.min(done, e);
    } else {
      for (const k of days(start, end)) {
        if (!isDue(doc, h, k)) continue;
        expected++;
        got += fraction(h, valueOf(doc, k, h.id));
      }
    }
  }
  return expected ? got / expected : null;
}

/** End date of the vacation covering key (latest among active habits), or null. */
export function vacationOn(doc, key) {
  let to = null;
  for (const h of activeHabits(doc)) {
    for (const p of h.pauses || []) if (p.vac && p.from <= key && p.to >= key && (!to || p.to > to)) to = p.to;
  }
  return to;
}

// ---- Mood --------------------------------------------------------------

export const MOOD_LABELS = ['Molto spiacevole', 'Spiacevole', 'Un po’ spiacevole', 'Neutro',
  'Un po’ piacevole', 'Piacevole', 'Molto piacevole'];

export const moodBand = (m) => (m <= 3 ? 'spiacevole' : m === 4 ? 'neutro' : 'piacevole');

/** The day's mood record, or null if none / cleared. */
export const moodOf = (doc, key) => (doc.journal?.[key]?.mood > 0 ? doc.journal[key] : null);

/** Over [from, to]: recorded days, mean completion per band, most frequent feelings and factors. */
export function moodStats(doc, from, to) {
  const sums = { spiacevole: [0, 0], neutro: [0, 0], piacevole: [0, 0] };
  const feelings = new Map();
  const factors = new Map();
  let n = 0;
  for (const k of days(from, to)) {
    const j = moodOf(doc, k);
    if (!j) continue;
    n++;
    const p = dayPercent(doc, k);
    if (p != null) {
      sums[moodBand(j.mood)][0] += p;
      sums[moodBand(j.mood)][1]++;
    }
    for (const f of j.feelings || []) feelings.set(f, (feelings.get(f) || 0) + 1);
    for (const f of j.factors || []) factors.set(f, (factors.get(f) || 0) + 1);
  }
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]);
  const byBand = Object.fromEntries(Object.entries(sums).map(([b, [s, c]]) => [b, c ? s / c : null]));
  return { days: n, byBand, feelings: top(feelings), factors: top(factors) };
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// ---- Statistics periods ----------------------------------------------------

/** Complete calendar period containing anchor, split in buckets: days (week, month), weeks (6 months), months (year). */
export function periodRange(kind, anchor) {
  if (kind === 'settimana') {
    const from = weekStart(anchor);
    return { from, to: addDays(from, 6), buckets: Array.from({ length: 7 }, (_, i) => ({ from: addDays(from, i), to: addDays(from, i) })) };
  }
  if (kind === 'mese') {
    const from = monthStart(anchor);
    const to = monthEnd(anchor);
    return { from, to, buckets: [...days(from, to)].map((k) => ({ from: k, to: k })) };
  }
  if (kind === '6mesi') {
    const from = addMonths(anchor, -5);
    const to = monthEnd(anchor);
    const buckets = [];
    for (let w = weekStart(from); w <= to; w = addDays(w, 7)) {
      buckets.push({ from: w < from ? from : w, to: addDays(w, 6) > to ? to : addDays(w, 6) });
    }
    return { from, to, buckets };
  }
  const from = `${anchor.slice(0, 4)}-01-01`;
  return {
    from,
    to: `${anchor.slice(0, 4)}-12-31`,
    buckets: Array.from({ length: 12 }, (_, i) => ({ from: addMonths(from, i), to: monthEnd(addMonths(from, i)) })),
  };
}

/** Anchor of the previous (dir = -1) or next (+1) period of the same kind. */
export function shiftPeriod(kind, anchor, dir) {
  if (kind === 'settimana') return addDays(anchor, 7 * dir);
  return addMonths(anchor, dir * ({ mese: 1, '6mesi': 6 }[kind] ?? 12));
}

/** Per bucket: habit completion (day % for single days) and mean recorded mood; future buckets are empty. */
export function bucketStats(doc, buckets, today) {
  const habits = activeHabits(doc);
  return buckets.map(({ from, to }) => {
    if (from > today) return { from, to, completion: null, mood: null, n: 0 };
    const end = to < today ? to : today;
    const moods = [];
    for (const k of days(from, end)) {
      const m = moodOf(doc, k);
      if (m) moods.push(m.mood);
    }
    const completion = from === to ? dayPercent(doc, from) : periodPercent(doc, habits, from, end, today);
    return { from, to, completion, mood: mean(moods), n: moods.length };
  });
}

/** For each mood level 1..7: completion of every day recorded at that level, and their mean. */
export function moodByLevel(doc, from, to) {
  const levels = Array.from({ length: 7 }, (_, i) => ({ level: i + 1, values: [], avg: null }));
  for (const k of days(from, to)) {
    const m = moodOf(doc, k);
    const p = dayPercent(doc, k);
    if (m && p != null) levels[m.mood - 1].values.push(p);
  }
  for (const l of levels) l.avg = mean(l.values);
  return levels;
}

// ---- Backup ------------------------------------------------------------

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const validPause = (p) => p && KEY_RE.test(p.from) && KEY_RE.test(p.to) && p.from <= p.to;

const strings = (a) => a === undefined || (Array.isArray(a) && a.every((s) => typeof s === 'string'));

function validJournalDay(j) {
  return !!j && typeof j === 'object' && Number.isInteger(j.mood) && j.mood >= 0 && j.mood <= 7
    && strings(j.feelings) && strings(j.factors) && (j.note === undefined || typeof j.note === 'string');
}

function validHabit(h) {
  if (!h || typeof h.id !== 'string' || typeof h.name !== 'string') return false;
  if (h.type !== 'check' && !(h.type === 'quantity' && h.target > 0)) return false;
  if (h.step !== undefined && !(h.step > 0)) return false;
  if (h.pauses !== undefined && !(Array.isArray(h.pauses) && h.pauses.every(validPause))) return false;
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
  if (d.journal !== undefined && !(isObj(d.journal)
    && Object.entries(d.journal).every(([k, j]) => KEY_RE.test(k) && validJournalDay(j)))) return false;
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
  let journal = 0;
  doc.journal ??= {};
  for (const [day, j] of Object.entries(incoming.journal || {})) {
    if (!doc.journal[day] || (j.t ?? 0) > (doc.journal[day].t ?? 0)) {
      doc.journal[day] = j;
      journal++;
    }
  }
  doc.settings.lastBackup = Math.max(doc.settings.lastBackup || 0, incoming.settings?.lastBackup || 0);
  return { doc, habits, entries, journal };
}
