import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import * as R from '../js/remind.js';

const habit = (o = {}) => ({
  id: 'a', name: 'Leggere', emoji: '📚', color: '#6366f1', type: 'check', target: 1, unit: '',
  freq: { kind: 'daily' }, start: '2026-10-01', order: 0, archived: false, deleted: false, updatedAt: 1, ...o,
});
const docWith = (habits) => ({ ...L.emptyDoc(), habits });
const at = (date, time) => ({ date, minutes: +time.slice(0, 2) * 60 + +time.slice(3) });
const ids = (list) => list.map((p) => p.id);

test('buildPlan: habits with a reminder time, sleep / mood / weekly from settings (defaults on)', () => {
  const d = docWith([
    habit({ remind: '22:00' }),
    habit({ id: 'b', remind: '07:30', freq: { kind: 'days', days: [1, 3] }, pauses: [{ from: '2026-10-10', to: '2026-10-12' }] }),
    habit({ id: 'c' }),                                         // no time: no reminder
    habit({ id: 'd', remind: '08:00', archived: true }),
  ]);
  const plan = R.buildPlan(d);
  assert.deepEqual(ids(plan), ['a', 'b', 'sleep', 'mood', 'weekly']);
  assert.equal(plan[1].days.join(), '1,3');
  assert.deepEqual(plan[1].pauses, [{ from: '2026-10-10', to: '2026-10-12' }]);
  assert.equal(JSON.stringify(plan).includes('Leggere'), false);   // the service never sees names
  d.reminders = { sleep: null, mood: '21:00', weekly: false, t: 1 };
  assert.deepEqual(ids(R.buildPlan(d)), ['a', 'b', 'mood']);
  assert.equal(R.buildPlan(d)[2].time, '21:00');
});

test('dueReminders: time window, sent once, done / skipped / paused / unscheduled excluded', () => {
  const d = docWith([
    habit({ remind: '22:00' }),
    habit({ id: 'b', remind: '22:00', freq: { kind: 'days', days: [3] } }),          // Wednesdays
    habit({ id: 'p', remind: '22:00', pauses: [{ from: '2026-10-27', to: '2026-10-30' }] }),
  ]);
  const plan = R.buildPlan(d);
  const thu = '2026-10-29';
  let state = R.buildState(d, thu);
  assert.deepEqual(ids(R.dueReminders(plan, state, at(thu, '21:59'), [])), []);
  assert.deepEqual(ids(R.dueReminders(plan, state, at(thu, '22:00'), [])), ['a']);   // b: not Thursday; p: paused
  assert.deepEqual(ids(R.dueReminders(plan, state, at(thu, '22:10'), [])), ['a']);
  assert.deepEqual(ids(R.dueReminders(plan, state, at(thu, '22:15'), [])), []);      // window closed
  assert.deepEqual(ids(R.dueReminders(plan, state, at(thu, '22:05'), ['a'])), []);   // already sent today
  d.entries[thu] = { a: { v: 1, t: 1 } };
  state = R.buildState(d, thu);
  assert.deepEqual(ids(R.dueReminders(plan, state, at(thu, '22:00'), [])), []);
  d.entries[thu] = { a: { v: 0, s: 1, t: 1 } };                                      // skipped counts as handled
  assert.deepEqual(ids(R.dueReminders(plan, R.buildState(d, thu), at(thu, '22:00'), [])), []);
  // yesterday's state means nothing is done yet today
  assert.deepEqual(ids(R.dueReminders(plan, state, at('2026-10-30', '22:00'), [])), ['a']);
});

test('dueReminders: weekly habits stop once the week target is met; sleep, mood, weekly summary', () => {
  const w = habit({ id: 'w', remind: '19:00', freq: { kind: 'weekly', times: 2 } });
  const d = docWith([w]);
  const plan = R.buildPlan(d);
  const mon = '2026-10-26';
  const wed = '2026-10-28';
  assert.deepEqual(ids(R.dueReminders(plan, R.buildState(d, wed), at(wed, '19:00'), [])), ['w']);
  d.entries[mon] = { w: { v: 1, t: 1 } };
  d.entries['2026-10-27'] = { w: { v: 1, t: 1 } };
  const tue = R.buildState(d, '2026-10-27');                                         // last opened on Tuesday
  assert.deepEqual(ids(R.dueReminders(plan, tue, at(wed, '19:00'), [])), []);         // target met this week
  assert.deepEqual(ids(R.dueReminders(plan, tue, at('2026-11-02', '19:00'), [])), ['w']);   // new week

  const sun = '2026-11-01';
  assert.deepEqual(ids(R.dueReminders(plan, null, at(sun, '20:00'), [])), ['weekly']);
  assert.deepEqual(ids(R.dueReminders(plan, null, at(wed, '20:00'), [])), []);       // summary on Sundays only
  assert.deepEqual(ids(R.dueReminders(plan, null, at(wed, '09:00'), [])), ['sleep']);
  d.sleep = { [wed]: { q: 4, t: 1 } };
  d.journal = { [wed]: { mood: 5, feelings: [], factors: [], note: '', t: 1 } };
  const s = R.buildState(d, wed);
  assert.deepEqual(ids(R.dueReminders(plan, s, at(wed, '09:00'), [])), []);
  assert.deepEqual(ids(R.dueReminders(plan, s, at(wed, '21:30'), [])), []);
});

test('localNow: wall clock in the user time zone, across daylight saving', () => {
  assert.deepEqual(R.localNow(Date.UTC(2026, 9, 28, 20, 30), 'Europe/Rome'), { date: '2026-10-28', minutes: 21 * 60 + 30 });
  assert.deepEqual(R.localNow(Date.UTC(2026, 6, 1, 22, 5), 'Europe/Rome'), { date: '2026-07-02', minutes: 5 });
});

test('validTime, settings validation and merge', () => {
  assert.equal(R.validTime('07:05'), true);
  assert.equal(R.validTime('24:00'), false);
  assert.equal(R.validTime('7:05'), false);
  assert.equal(L.validateDoc(docWith([habit({ remind: '22:00' })])), true);
  assert.equal(L.validateDoc(docWith([habit({ remind: '25:00' })])), false);
  assert.equal(L.validateDoc({ ...L.emptyDoc(), reminders: { sleep: '09:00', mood: null, weekly: true, t: 1 } }), true);
  assert.equal(L.validateDoc({ ...L.emptyDoc(), reminders: { sleep: 'presto', t: 1 } }), false);
  const a = { ...L.emptyDoc(), reminders: { sleep: '09:00', mood: '21:30', weekly: true, t: 5 } };
  const b = { ...L.emptyDoc(), reminders: { sleep: null, mood: '21:30', weekly: false, t: 9 } };
  const r = L.mergeDocs(a, b);
  assert.equal(r.doc.reminders.sleep, null);
  assert.equal(r.reminders, 1);
  assert.equal(L.mergeDocs(b, a).reminders, 0);
});

test('buildMirror: names and the week summary stay on the device', () => {
  const d = docWith([habit({ remind: '22:00' })]);
  d.entries['2026-10-26'] = { a: { v: 1, t: 1 } };
  const m = R.buildMirror(d, '2026-10-27');
  assert.equal(m.names.a, '📚 Leggere');
  assert.equal(m.week, '2026-10-26');
  assert.match(m.summary, /50%/);
});
