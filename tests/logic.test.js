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
