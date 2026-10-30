import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const habit = (o = {}) => ({
  id: 'a', name: 'A', emoji: '', color: '#6366f1', type: 'check', target: 1, unit: '',
  freq: { kind: 'daily' }, start: '2026-01-01', order: 0,
  archived: false, deleted: false, updatedAt: 1, ...o,
});

// done: { habitId: { 'YYYY-MM-DD': value } }
function docWith(habits, done = {}) {
  const d = L.emptyDoc();
  d.habits = habits;
  for (const [id, days] of Object.entries(done)) {
    for (const [k, v] of Object.entries(days)) (d.entries[k] ??= {})[id] = { v, t: 1 };
  }
  return d;
}
const mark = (keys, v = 1) => Object.fromEntries(keys.map((k) => [k, v]));

test('date helpers', () => {
  assert.equal(L.toKey(new Date(2026, 9, 27)), '2026-10-27');
  assert.equal(L.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(L.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(L.addDays('2026-10-24', 2), '2026-10-26'); // DST change 25/10
  assert.equal(L.weekday('2026-10-27'), 2);
  assert.equal(L.weekday('2026-11-01'), 7);
  assert.equal(L.weekStart('2026-11-01'), '2026-10-26');
  assert.equal(L.monthEnd('2026-02-10'), '2026-02-28');
  assert.equal(L.addMonths('2026-11-15', 2), '2027-01-01');
});

test('fraction and isDone', () => {
  const c = habit();
  const q = habit({ type: 'quantity', target: 8 });
  assert.equal(L.fraction(c, 0), 0);
  assert.equal(L.fraction(c, 1), 1);
  assert.equal(L.fraction(q, 6), 0.75);
  assert.equal(L.fraction(q, 10), 1);
  assert.equal(L.isDone(q, 7), false);
  assert.equal(L.isDone(q, 8), true);
});

test('isScheduled', () => {
  const d = habit({ start: '2026-10-27' });
  assert.equal(L.isScheduled(d, '2026-10-26'), false);
  assert.equal(L.isScheduled(d, '2026-10-27'), true);
  const mwf = habit({ freq: { kind: 'days', days: [1, 3, 5] } });
  assert.equal(L.isScheduled(mwf, '2026-10-27'), false);
  assert.equal(L.isScheduled(mwf, '2026-10-28'), true);
  assert.equal(L.isScheduled(habit({ freq: { kind: 'weekly', times: 3 } }), '2026-10-28'), false);
});

test('currentStreak daily: today pending does not break', () => {
  const h = habit();
  const base = ['2026-10-24', '2026-10-25', '2026-10-26'];
  assert.equal(L.currentStreak(docWith([h], { a: mark(base) }), h, '2026-10-27'), 3);
  assert.equal(L.currentStreak(docWith([h], { a: mark([...base, '2026-10-27']) }), h, '2026-10-27'), 4);
  assert.equal(L.currentStreak(docWith([h], { a: mark(['2026-10-24', '2026-10-26']) }), h, '2026-10-27'), 1);
});

test('currentStreak specific days skips unscheduled days', () => {
  const h = habit({ freq: { kind: 'days', days: [1, 3, 5] } });
  const all = ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26'];
  assert.equal(L.currentStreak(docWith([h], { a: mark(all) }), h, '2026-10-27'), 4);
  const gap = ['2026-10-19', '2026-10-23', '2026-10-26'];
  assert.equal(L.currentStreak(docWith([h], { a: mark(gap) }), h, '2026-10-27'), 2);
});

test('weekly streak counts weeks, current week pending', () => {
  const h = habit({ freq: { kind: 'weekly', times: 2 }, start: '2026-10-12' });
  const prev = ['2026-10-13', '2026-10-15', '2026-10-20', '2026-10-22'];
  const d1 = docWith([h], { a: mark([...prev, '2026-10-26']) });
  assert.equal(L.currentStreak(d1, h, '2026-10-27'), 2);
  assert.equal(L.bestStreak(d1, h, '2026-10-27'), 2);
  const d2 = docWith([h], { a: mark([...prev, '2026-10-26', '2026-10-27']) });
  assert.equal(L.currentStreak(d2, h, '2026-10-27'), 3);
  assert.equal(L.weekCount(d2, h, '2026-10-27'), 2);
});

test('streak across year boundary', () => {
  const h = habit({ start: '2025-12-28' });
  const d = docWith([h], { a: mark(['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']) });
  assert.equal(L.currentStreak(d, h, '2026-01-02'), 5);
});

test('bestStreak finds longest run', () => {
  const h = habit({ start: '2026-10-01' });
  const run1 = Array.from({ length: 10 }, (_, i) => L.addDays('2026-10-01', i));
  const run2 = Array.from({ length: 7 }, (_, i) => L.addDays('2026-10-20', i));
  const d = docWith([h], { a: mark([...run1, ...run2]) });
  assert.equal(L.bestStreak(d, h, '2026-10-27'), 10);
  assert.equal(L.currentStreak(d, h, '2026-10-27'), 7);
});

test('dayPercent', () => {
  assert.equal(L.dayPercent(L.emptyDoc(), '2026-10-27'), null);
  const a = habit();
  const b = habit({ id: 'b', type: 'quantity', target: 8, order: 1 });
  const arch = habit({ id: 'c', archived: true });
  const d = docWith([a, b, arch], { a: { '2026-10-27': 1 }, b: { '2026-10-27': 4 } });
  assert.equal(L.dayPercent(d, '2026-10-27'), 0.75);
});

test('habitDayFraction', () => {
  const h = habit({ freq: { kind: 'days', days: [1] }, start: '2026-10-01' });
  const d = docWith([h], { a: { '2026-10-26': 1 } });
  assert.equal(L.habitDayFraction(d, h, '2026-09-28'), null);
  assert.equal(L.habitDayFraction(d, h, '2026-10-27'), null);
  assert.equal(L.habitDayFraction(d, h, '2026-10-26'), 1);
});

test('periodPercent daily and weekly', () => {
  const h = habit({ start: '2026-10-26' });
  const d = docWith([h], { a: { '2026-10-26': 1 } });
  assert.equal(L.periodPercent(d, [h], '2026-10-26', '2026-11-01', '2026-10-27'), 0.5);
  const w = habit({ freq: { kind: 'weekly', times: 3 }, start: '2026-10-01' });
  const dw = docWith([w], { a: mark(['2026-10-20', '2026-10-22']) });
  assert.equal(L.periodPercent(dw, [w], '2026-10-19', '2026-10-25', '2026-10-27'), 2 / 3);
  assert.equal(L.periodPercent(dw, [w], '2026-11-02', '2026-11-08', '2026-10-27'), null);
});

test('mergeDocs: newest wins', () => {
  const local = docWith([habit({ updatedAt: 5 })]);
  local.entries['2026-10-27'] = { a: { v: 1, t: 5 } };
  const incoming = docWith([habit({ name: 'B', updatedAt: 9 }), habit({ id: 'b', updatedAt: 1 })]);
  incoming.entries['2026-10-27'] = { a: { v: 0, t: 3 } };
  incoming.entries['2026-10-26'] = { a: { v: 1, t: 2 } };
  const r = L.mergeDocs(local, incoming);
  assert.equal(r.habits, 2);
  assert.equal(r.entries, 1);
  assert.equal(r.doc.habits.find((h) => h.id === 'a').name, 'B');
  assert.equal(r.doc.entries['2026-10-27'].a.v, 1);
  assert.equal(r.doc.entries['2026-10-26'].a.v, 1);
  assert.equal(local.habits[0].name, 'A'); // input not mutated
});

test('pauses: paused days are not scheduled and do not break streaks', () => {
  const h = habit({ start: '2026-10-20', pauses: [{ from: '2026-10-23', to: '2026-10-25' }] });
  assert.equal(L.isPaused(h, '2026-10-24'), true);
  assert.equal(L.isScheduled(h, '2026-10-24'), false);
  const d = docWith([h], { a: mark(['2026-10-21', '2026-10-22', '2026-10-26']) });
  assert.equal(L.currentStreak(d, h, '2026-10-27'), 3);
  assert.equal(L.periodPercent(d, [h], '2026-10-20', '2026-10-26', '2026-10-27'), 3 / 4);
});

test('skip: a skipped day is not due', () => {
  const h = habit({ start: '2026-10-20' });
  const d = docWith([h], { a: mark(['2026-10-24', '2026-10-26']) });
  d.entries['2026-10-25'] = { a: { v: 0, s: 1, t: 2 } };
  assert.equal(L.isSkipped(d, h, '2026-10-25'), true);
  assert.equal(L.currentStreak(d, h, '2026-10-27'), 2);
  assert.equal(L.dayPercent(d, '2026-10-25'), null);
  assert.equal(L.habitDayFraction(d, h, '2026-10-25'), null);
});

test('weekly habits with pauses: target prorated, fully paused week ignored', () => {
  const h = habit({
    freq: { kind: 'weekly', times: 3 }, start: '2026-10-05',
    pauses: [{ from: '2026-10-12', to: '2026-10-18' }, { from: '2026-10-19', to: '2026-10-23' }],
  });
  const d = docWith([h], { a: mark(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-24']) });
  assert.equal(L.currentStreak(d, h, '2026-10-27'), 2);
  assert.equal(L.bestStreak(d, h, '2026-10-27'), 2);
});

test('journal: merge newest wins, validation of journal and pauses', () => {
  const a = L.emptyDoc();
  a.journal = { '2026-10-27': { mood: 6, feelings: ['Felicità'], factors: [], note: 'ok', t: 5 } };
  const b = L.emptyDoc();
  b.journal = {
    '2026-10-27': { mood: 2, feelings: [], factors: ['Lavoro'], note: '', t: 9 },
    '2026-10-26': { mood: 4, feelings: [], factors: [], note: '', t: 1 },
  };
  const r = L.mergeDocs(a, b);
  assert.equal(r.journal, 2);
  assert.equal(r.doc.journal['2026-10-27'].mood, 2);
  assert.equal(L.validateDoc(r.doc), true);
  assert.equal(L.validateDoc({ ...L.emptyDoc(), journal: { '2026-10-27': { mood: 9, t: 1 } } }), false);
  assert.equal(L.validateDoc(docWith([habit({ pauses: [{ from: '2026-10-25', to: '2026-10-20' }] })])), false);
  assert.equal(L.validateDoc(docWith([habit({ pauses: [{ from: '2026-10-20', to: '2026-10-25', vac: true }] })])), true);
});

test('moodBand and moodStats', () => {
  assert.equal(L.moodBand(2), 'spiacevole');
  assert.equal(L.moodBand(4), 'neutro');
  assert.equal(L.moodBand(6), 'piacevole');
  const h = habit({ start: '2026-10-20' });
  const d = docWith([h], { a: mark(['2026-10-26']) });
  d.journal = {
    '2026-10-26': { mood: 6, feelings: ['Felicità'], factors: ['Sport'], note: '', t: 1 },
    '2026-10-25': { mood: 2, feelings: ['Stanchezza', 'Felicità'], factors: ['Lavoro'], note: '', t: 1 },
  };
  const s = L.moodStats(d, '2026-10-20', '2026-10-27');
  assert.equal(s.days, 2);
  assert.equal(s.byBand.piacevole, 1);
  assert.equal(s.byBand.spiacevole, 0);
  assert.equal(s.byBand.neutro, null);
  assert.deepEqual(s.feelings[0], ['Felicità', 2]);
});

test('periodRange / shiftPeriod: complete calendar periods', () => {
  const w = L.periodRange('settimana', '2026-10-28');
  assert.deepEqual([w.from, w.to, w.buckets.length], ['2026-10-26', '2026-11-01', 7]);
  const m = L.periodRange('mese', '2026-02-10');
  assert.deepEqual([m.from, m.to, m.buckets.length], ['2026-02-01', '2026-02-28', 28]);
  const y = L.periodRange('anno', '2026-10-28');
  assert.deepEqual([y.buckets.length, y.buckets[0].from, y.buckets[11].to], [12, '2026-01-01', '2026-12-31']);
  const s = L.periodRange('6mesi', '2026-10-28');
  assert.deepEqual([s.from, s.to, s.buckets[0].from, s.buckets.at(-1).to], ['2026-05-01', '2026-10-31', '2026-05-01', '2026-10-31']);
  assert.equal(L.shiftPeriod('settimana', '2026-10-28', -1), '2026-10-21');
  assert.equal(L.shiftPeriod('mese', '2026-10-28', 1), '2026-11-01');
  assert.equal(L.shiftPeriod('anno', '2026-10-28', -1), '2025-10-01');
});

test('bucketStats: completion and mean mood per bucket, future empty', () => {
  const h = habit({ start: '2026-10-19' });
  const d = docWith([h], { a: mark(['2026-10-20', '2026-10-21', '2026-10-26', '2026-10-27']) });
  d.journal = {
    '2026-10-20': { mood: 6, t: 1 },
    '2026-10-22': { mood: 2, t: 1 },
    '2026-10-26': { mood: 7, t: 1 },
    '2026-10-27': { mood: 0, t: 2 },                       // cleared: ignored
  };
  const week = L.bucketStats(d, L.periodRange('settimana', '2026-10-28').buckets, '2026-10-28');
  assert.deepEqual(week.slice(0, 4).map((b) => [b.completion, b.mood]), [[1, 7], [1, null], [0, null], [null, null]]);
  const weeks = L.bucketStats(d, [{ from: '2026-10-19', to: '2026-10-25' }], '2026-10-28');
  assert.deepEqual([weeks[0].mood, weeks[0].n], [4, 2]);
  assert.equal(weeks[0].completion, 2 / 7);
  const lv = L.moodByLevel(d, '2026-10-19', '2026-10-27');
  assert.equal(lv.length, 7);
  assert.deepEqual(lv[5].values, [1]);                    // level 6 on 20th: done
  assert.deepEqual(lv[1].values, [0]);                    // level 2 on 22nd: not done
  assert.equal(lv[6].avg, 1);                             // level 7 on 26th: done
  assert.equal(lv[3].avg, null);
});

test('stepOf and nudge: custom +/- step for quantity habits', () => {
  assert.equal(L.stepOf(habit()), 1);
  assert.equal(L.stepOf(habit({ type: 'quantity', target: 2 })), 1);
  assert.equal(L.stepOf(habit({ type: 'quantity', target: 2, step: 0.5 })), 0.5);
  assert.equal(L.nudge(1.5, 0.5, 1), 2);
  assert.equal(L.nudge(2, 0.5, -1), 1.5);
  assert.equal(L.nudge(0.2, 0.1, 1), 0.3);          // no floating-point drift (0.30000000000000004)
  assert.equal(L.nudge(0.3, 0.5, -1), 0);           // never below zero
});

test('validateDoc', () => {
  assert.equal(L.validateDoc(docWith([habit({ type: 'quantity', target: 2, step: 0.5 })])), true);
  assert.equal(L.validateDoc(docWith([habit({ type: 'quantity', target: 2, step: 0 })])), false);
  assert.equal(L.validateDoc(L.emptyDoc()), true);
  assert.equal(L.validateDoc(docWith([habit()], { a: { '2026-10-27': 1 } })), true);
  assert.equal(L.validateDoc({ ...L.emptyDoc(), version: 2 }), false);
  assert.equal(L.validateDoc(docWith([habit({ freq: { kind: 'monthly' } })])), false);
  assert.equal(L.validateDoc(docWith([habit({ freq: { kind: 'days', days: [] } })])), false);
  assert.equal(L.validateDoc({ ...L.emptyDoc(), entries: [] }), false);
  assert.equal(L.validateDoc(null), false);
});

test('sleep: sleepOf, validation, merge newest wins', () => {
  const a = L.emptyDoc();
  assert.deepEqual(a.sleep, {});
  a.sleep = { '2026-10-27': { q: 4, h: 7.5, t: 5 }, '2026-10-28': { q: 0, t: 9 } };
  assert.equal(L.sleepOf(a, '2026-10-27').h, 7.5);
  assert.equal(L.sleepOf(a, '2026-10-28'), null);            // q 0 = deleted
  assert.equal(L.sleepOf(a, '2026-10-29'), null);
  assert.equal(L.validateDoc(a), true);
  assert.equal(L.validateDoc({ ...L.emptyDoc(), sleep: { '2026-10-27': { q: 6, t: 1 } } }), false);
  assert.equal(L.validateDoc({ ...L.emptyDoc(), sleep: { '2026-10-27': { q: 3, h: 25, t: 1 } } }), false);
  assert.equal(L.validateDoc({ ...L.emptyDoc(), sleep: { '2026-10-27': { q: 2.5, t: 1 } } }), false);
  const { sleep, ...old } = L.emptyDoc();
  assert.equal(L.validateDoc(old), true);                    // documents from older versions
  const b = L.emptyDoc();
  b.sleep = { '2026-10-27': { q: 2, t: 4 }, '2026-10-28': { q: 5, h: 8, t: 10 } };
  const r = L.mergeDocs(a, b);
  assert.equal(r.sleep, 1);
  assert.equal(r.doc.sleep['2026-10-27'].q, 4);
  assert.equal(r.doc.sleep['2026-10-28'].q, 5);
  assert.equal(L.mergeDocs(a, old).sleep, 0);
});

test('bucketStats: mean sleep quality and hours per bucket', () => {
  const d = docWith([habit({ start: '2026-10-19' })]);
  d.sleep = {
    '2026-10-20': { q: 4, h: 7, t: 1 },
    '2026-10-21': { q: 2, t: 1 },
    '2026-10-22': { q: 0, h: 9, t: 1 },
  };
  const [day20, day21, day22] = L.bucketStats(d, L.periodRange('settimana', '2026-10-21').buckets.slice(1, 4), '2026-10-27');
  assert.equal(day20.sleep, 4);
  assert.equal(day20.hours, 7);
  assert.equal(day21.sleep, 2);
  assert.equal(day21.hours, null);
  assert.equal(day22.sleep, null);
  const [week] = L.bucketStats(d, [{ from: '2026-10-19', to: '2026-10-25' }], '2026-10-27');
  assert.equal(week.sleep, 3);
  assert.equal(week.nights, 2);
});

test('habitEffects: habit day vs next night (sleep, hours), same day (mood), 3+3 minimum', () => {
  const run = habit({ id: 'r', start: '2026-10-01' });
  const read = habit({ id: 'b', start: '2026-10-01' });
  const done = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
  const d = docWith([run, read], { r: mark(done), b: mark(['2026-10-01', '2026-10-02']) });
  (d.entries['2026-10-08'] ??= {}).r = { v: 0, s: 1, t: 1 };  // skipped: excluded
  d.sleep = {};
  d.journal = {};
  for (let i = 1; i <= 9; i++) {
    const k = `2026-10-0${i}`;
    const good = i >= 2 && i <= 5;                              // nights after the 4 run days
    d.sleep[k] = { q: good ? 5 : 2, h: good ? 8 : 6, t: 1 };
    d.journal[k] = { mood: done.includes(k) ? 6 : 3, feelings: [], factors: [], note: '', t: 1 };
  }
  const sleep = L.habitEffects(d, '2026-10-01', '2026-10-08', 'sleep');
  assert.equal(sleep.length, 1);                                // 'b' has only 2 days with
  assert.equal(sleep[0].habit.id, 'r');
  assert.equal(sleep[0].nWith, 4);
  assert.equal(sleep[0].nWithout, 3);                           // 5, 6, 7 → nights 6, 7, 8; 8 skipped
  assert.equal(sleep[0].with, 5);
  assert.equal(sleep[0].without, 2);
  assert.equal(sleep[0].diff, 3);
  const hours = L.habitEffects(d, '2026-10-01', '2026-10-08', 'hours');
  assert.equal(hours[0].diff, 2);
  const mood = L.habitEffects(d, '2026-10-01', '2026-10-08', 'mood');
  assert.equal(mood[0].with, 6);
  assert.equal(mood[0].without, 3);
});

test('sleepByLevel: each night with the completion of the day before', () => {
  const h = habit({ start: '2026-10-19' });
  const d = docWith([h], { a: mark(['2026-10-19', '2026-10-21']) });
  d.sleep = {
    '2026-10-20': { q: 5, t: 1 },                 // after the 19th: done
    '2026-10-21': { q: 2, t: 1 },                 // after the 20th: not done
    '2026-10-22': { q: 5, h: 8, t: 1 },           // after the 21st: done
    '2026-10-19': { q: 3, t: 1 },                 // day before the habit started: no completion
  };
  const lv = L.sleepByLevel(d, '2026-10-19', '2026-10-27');
  assert.equal(lv.length, 5);
  assert.deepEqual(lv[4].values, [1, 1]);
  assert.deepEqual(lv[1].values, [0]);
  assert.deepEqual(lv[2].values, []);
  assert.equal(lv[4].avg, 1);
  assert.equal(lv[0].avg, null);
});

test('notes per habit and day; future start dates count from the start', () => {
  const d = { ...L.emptyDoc(), habits: [habit({ start: '2026-11-01' })], entries: { '2026-10-30': { a: { v: 1, n: 'tè verde', t: 1 } } } };
  assert.equal(L.validateDoc(d), true);
  assert.equal(L.noteOf(d, '2026-10-30', 'a'), 'tè verde');
  assert.equal(L.noteOf(d, '2026-10-31', 'a'), '');
  assert.equal(L.validateDoc({ ...d, entries: { '2026-10-30': { a: { v: 1, n: 5, t: 1 } } } }), false);
  assert.equal(L.isScheduled(d.habits[0], '2026-10-31'), false);
  assert.equal(L.isScheduled(d.habits[0], '2026-11-01'), true);
  assert.equal(L.currentStreak(d, d.habits[0], '2026-10-30'), 0);
});
