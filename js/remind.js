// Reminders. Pure and shared by the app, which builds the plan and today's state for the push service, and by
// the Cloudflare worker, which decides what is due. The service only ever sees ids, days and times: names and the
// week summary stay on the device (buildMirror) and the service worker writes the notification text from them.
import {
  activeHabits, addDays, weekStart, weekday, isSkipped, valueOf, fraction, weekCount, moodOf, sleepOf,
  periodPercent, currentStreak, validTime,
} from './logic.js';

export { validTime };

export const DEFAULTS = { sleep: '09:00', mood: '21:30', weekly: true };
export const WEEKLY_TIME = '20:00';                 // Sunday summary
const WINDOW_MIN = 15;                              // the worker runs every 5 minutes; a late run still catches up

const toMinutes = (t) => +t.slice(0, 2) * 60 + +t.slice(3);

/** Synced reminder settings with defaults (sleep / mood: "HH:MM" or null = off; weekly: bool). */
export const reminderSettings = (doc) => ({ ...DEFAULTS, ...doc.reminders });

/** What the service needs to decide on its own. */
export function buildPlan(doc) {
  const r = reminderSettings(doc);
  const plan = [];
  for (const h of activeHabits(doc)) {
    if (!validTime(h.remind)) continue;
    plan.push({
      id: h.id,
      kind: 'habit',
      time: h.remind,
      from: h.start,
      days: h.freq.kind === 'days' ? [...h.freq.days] : null,
      weekly: h.freq.kind === 'weekly',
      pauses: (h.pauses || []).map(({ from, to }) => ({ from, to })),
    });
  }
  if (validTime(r.sleep)) plan.push({ id: 'sleep', kind: 'sleep', time: r.sleep });
  if (validTime(r.mood)) plan.push({ id: 'mood', kind: 'mood', time: r.mood });
  if (r.weekly) plan.push({ id: 'weekly', kind: 'weekly', time: WEEKLY_TIME, days: [7] });
  return plan;
}

/** Today's progress, as far as reminders care: done or skipped habits, weekly targets met, sleep and mood logged. */
export function buildState(doc, today) {
  const done = [];
  const weekDone = [];
  for (const h of activeHabits(doc)) {
    if (!validTime(h.remind)) continue;
    if (isSkipped(doc, h, today) || fraction(h, valueOf(doc, today, h.id)) >= 1) done.push(h.id);
    if (h.freq.kind === 'weekly' && weekCount(doc, h, today) >= h.freq.times) weekDone.push(h.id);
  }
  return { date: today, week: weekStart(today), done, weekDone, sleep: !!sleepOf(doc, today), mood: !!moodOf(doc, today) };
}

/** Still needed on date? A state from an earlier day means nothing has been done yet today. */
function pending(p, state, date) {
  if (p.days && !p.days.includes(weekday(date))) return false;
  if (p.kind === 'weekly') return true;
  const today = state?.date === date ? state : null;
  if (p.kind === 'sleep') return !today?.sleep;
  if (p.kind === 'mood') return !today?.mood;
  if (date < p.from || p.pauses?.some((x) => date >= x.from && date <= x.to)) return false;
  if (p.weekly && state?.week === weekStart(date) && state.weekDone?.includes(p.id)) return false;
  return !today?.done?.includes(p.id);
}

/** Plan entries due at now = { date, minutes } (local wall clock) and not yet sent today. */
export function dueReminders(plan, state, now, sent) {
  return plan.filter((p) => {
    const late = now.minutes - toMinutes(p.time);
    return late >= 0 && late < WINDOW_MIN && !sent.includes(p.id) && pending(p, state, now.date);
  });
}

/** Wall clock in a time zone: { date: 'YYYY-MM-DD', minutes since midnight }. */
export function localNow(ms, tz) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}

/** Kept on the device for the service worker: habit names and this week's summary. */
export function buildMirror(doc, today) {
  const habits = activeHabits(doc);
  const names = Object.fromEntries(habits.map((h) => [h.id, `${h.emoji ? `${h.emoji} ` : ''}${h.name}`]));
  const week = weekStart(today);
  const p = periodPercent(doc, habits, week, addDays(week, 6), today);
  let best = null;
  for (const h of habits) {
    const n = currentStreak(doc, h, today);
    if (n > 1 && (!best || n > best.n)) best = { h, n };
  }
  const streak = best ? ` · 🔥 ${best.h.name}: ${best.n} ${best.h.freq.kind === 'weekly' ? 'settimane' : 'giorni'} di fila` : '';
  const summary = p == null ? 'Guarda com’è andata la settimana.' : `Hai completato il ${Math.round(p * 100)}% delle abitudini${streak}.`;
  return { names, week, summary };
}
