// Persistence: the only module that touches localStorage.
// Emits 'change' after data mutations and 'sync' when sync status or the banner changes.
import { emptyDoc, validateDoc, mergeDocs, activeHabits, todayKey, addDays } from './logic.js';
import { connect, syncOnce } from './sync.js';
import { reminderSettings } from './remind.js';

const KEY = 'habits.v1';
const SYNC_KEY = 'habits.sync';
const PUSH_KEY = 'habits.push';            // device only: { device, on }
const bus = new EventTarget();
let doc = emptyDoc();
let notice = '';          // banner message
let readOnly = false;

let syncCfg = null;       // { token, gistId, salt, iterations, key, at }
let sync = { state: 'off', message: '', at: 0 };   // off | idle | syncing | offline | error
let syncTimer = 0;
let syncing = false;
let syncAgain = false;

export function load() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    readOnly = true;
    notice = 'Memoria del browser non disponibile: i dati non verranno salvati.';
    return;
  }
  try {
    syncCfg = JSON.parse(localStorage.getItem(SYNC_KEY));
  } catch {
    syncCfg = null;
  }
  if (syncCfg) sync = { state: 'idle', message: '', at: syncCfg.at || 0 };
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    if (!validateDoc(d)) throw new Error('invalid');
    d.settings = { theme: 'auto', lastBackup: 0, ...d.settings };
    d.journal ??= {};
    d.sleep ??= {};
    doc = d;
  } catch {
    try { localStorage.setItem(KEY + '.corrupt', raw); } catch { /* best effort */ }
    notice = 'I dati salvati erano danneggiati: ne ho conservato una copia e sono ripartito da zero. Puoi importare un backup.';
  }
}

export const getDoc = () => doc;
export const getNotice = () => notice;
export const onChange = (fn) => bus.addEventListener('change', fn);
export const onSync = (fn) => bus.addEventListener('sync', fn);

const emit = (type = 'change') => bus.dispatchEvent(new Event(type));

export function clearNotice() {
  notice = '';
  emit('sync');
}

/** Write to storage and notify views, without scheduling a sync. */
function persist() {
  if (!readOnly) {
    try {
      localStorage.setItem(KEY, JSON.stringify(doc));
    } catch {
      notice = 'Spazio esaurito: impossibile salvare. Esporta un backup.';
    }
  }
  emit();
}

/** User change: persist and upload a few seconds later. */
function save() {
  persist();
  scheduleSync();
}

const newId = () => 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const find = (id) => doc.habits.find((h) => h.id === id);

// ---- Habits ------------------------------------------------------------

export function createHabit(fields) {
  const order = Math.max(-1, ...doc.habits.map((h) => h.order)) + 1;
  doc.habits.push({ archived: false, deleted: false, ...fields, id: newId(), order, updatedAt: Date.now() });
  save();
}

export function updateHabit(id, patch) {
  const h = find(id);
  if (!h) return;
  Object.assign(h, patch, { updatedAt: Date.now() });
  save();
}

/** Swap with the neighbour in the active list (dir = -1 up, +1 down). */
export function moveHabit(id, dir) {
  const list = activeHabits(doc);
  const i = list.findIndex((h) => h.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  list.forEach((h, k) => { h.order = k; });       // normalise ties after merges
  [list[i].order, list[j].order] = [j, i];
  list[i].updatedAt = list[j].updatedAt = Date.now();
  save();
}

// ---- Entries and settings ---------------------------------------------

export function setEntry(key, id, v) {
  (doc.entries[key] ??= {})[id] = { v: Math.max(0, v), t: Date.now() };
  save();
}

/** "Salta oggi" on/off for one habit on one day (a skip also clears the value). */
export function setSkip(key, id, skipped) {
  (doc.entries[key] ??= {})[id] = skipped ? { v: 0, s: 1, t: Date.now() } : { v: 0, t: Date.now() };
  save();
}

// ---- Pauses and vacation -------------------------------------------------

export function addPause(id, from, to) {
  const h = find(id);
  if (h) updateHabit(id, { pauses: [...(h.pauses || []), { from, to }] });
}

export function removePause(id, index) {
  const h = find(id);
  if (h) updateHabit(id, { pauses: (h.pauses || []).filter((_, i) => i !== index) });
}

/** Pause every active habit for [from, to], marked as vacation. */
export function startVacation(from, to) {
  const now = Date.now();
  for (const h of activeHabits(doc)) {
    h.pauses = [...(h.pauses || []), { from, to, vac: true }];
    h.updatedAt = now;
  }
  save();
}

/** End the vacation covering today: shorten it to yesterday, or drop it if it starts today. */
export function endVacation(today) {
  const covers = (p) => p.vac && p.from <= today && p.to >= today;
  const now = Date.now();
  for (const h of doc.habits) {
    if (!h.pauses?.some(covers)) continue;
    h.pauses = h.pauses.flatMap((p) => {
      if (!covers(p)) return [p];
      return p.from === today ? [] : [{ ...p, to: addDays(today, -1) }];
    });
    h.updatedAt = now;
  }
  save();
}

// ---- Mood journal --------------------------------------------------------

export function setJournal(key, { mood, feelings = [], factors = [], note = '' }) {
  doc.journal[key] = { mood, feelings, factors, note, t: Date.now() };
  save();
}

/** Clearing keeps a dated tombstone (mood 0) so the deletion syncs to other devices. */
export function clearJournal(key) {
  doc.journal[key] = { mood: 0, feelings: [], factors: [], note: '', t: Date.now() };
  save();
}

// ---- Sleep ---------------------------------------------------------------

/** The night ending on the morning of key: quality 1..5, hours optional. */
export function setSleep(key, { q, h }) {
  doc.sleep[key] = Number.isFinite(h) ? { q, h, t: Date.now() } : { q, t: Date.now() };
  save();
}

/** Clearing keeps a dated tombstone (q 0) so the deletion syncs to other devices. */
export function clearSleep(key) {
  doc.sleep[key] = { q: 0, t: Date.now() };
  save();
}

// ---- Reminders -----------------------------------------------------------

/** Synced: sleep / mood times ("HH:MM" or null = off), weekly summary on/off. */
export function setReminders(patch) {
  doc.reminders = { ...reminderSettings(doc), ...patch, t: Date.now() };
  save();
}

export function getPushPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PUSH_KEY)) || {};
  } catch {
    return {};
  }
}

export function setPushPrefs(p) {
  try {
    localStorage.setItem(PUSH_KEY, JSON.stringify(p));
  } catch { /* notifications still work for this session */ }
}

export function setSetting(k, v) {
  doc.settings[k] = v;
  persist();                                      // device-local: nothing to upload
}

// ---- Backup ------------------------------------------------------------

/** Share sheet on touch devices (iPhone → "Salva in File"), download elsewhere. False if cancelled. */
export async function exportBackup() {
  const name = `habits-backup-${todayKey()}.json`;
  const file = new File([JSON.stringify(doc, null, 2)], name, { type: 'application/json' });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e.name === 'AbortError') return false;
      throw e;
    }
  } else {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  doc.settings.lastBackup = Date.now();
  persist();
  return true;
}

export async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Il file non è un JSON valido.');
  }
  if (!validateDoc(data)) throw new Error('Il file non è un backup di Habits valido.');
  const r = mergeDocs(doc, data);
  doc = r.doc;
  save();
  return { habits: r.habits, entries: r.entries };
}

// ---- Sync --------------------------------------------------------------

export const getSync = () => ({ connected: !!syncCfg, ...sync });

/** The GitHub token also authorises calls to the reminders service. */
export const getSyncToken = () => syncCfg?.token ?? null;

function setSync(state, message = '', at = sync.at) {
  sync = { state, message, at };
  emit('sync');
}

function storeSyncCfg() {
  try {
    if (syncCfg) localStorage.setItem(SYNC_KEY, JSON.stringify(syncCfg));
    else localStorage.removeItem(SYNC_KEY);
  } catch { /* config lives in memory for this session */ }
}

/** Keep anything edited while a network round trip was in flight (newest wins). */
function adopt(merged) {
  const r = mergeDocs(doc, merged);
  if (r.habits + r.entries + r.journal + r.sleep + r.reminders) {
    doc = r.doc;
    persist();
  }
}

/** Throws SyncError (wrong password, bad token, offline…). */
export async function connectSync(token, password) {
  const r = await connect({ token: token.trim(), password, local: doc });
  syncCfg = { ...r.cfg, at: Date.now() };
  storeSyncCfg();
  adopt(r.doc);
  setSync('idle', '', syncCfg.at);
}

export function disconnectSync() {
  clearTimeout(syncTimer);
  syncTimer = 0;
  syncCfg = null;
  storeSyncCfg();
  setSync('off');
}

export function scheduleSync(delay = 3000) {
  if (!syncCfg) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

/** Upload a pending change right away (the app is going to the background). */
export function flushSync() {
  if (syncTimer) runSync();
}

export async function runSync() {
  clearTimeout(syncTimer);
  syncTimer = 0;
  if (!syncCfg) return;
  if (syncing) {
    syncAgain = true;
    return;
  }
  if (!navigator.onLine) {
    setSync('offline', 'Offline: sincronizzo appena torna la rete.');
    return;
  }
  syncing = true;
  setSync('syncing');
  try {
    const r = await syncOnce({ cfg: syncCfg, local: doc });
    if (!syncCfg) return;                         // disconnected meanwhile
    adopt(r.doc);
    syncCfg.at = Date.now();
    storeSyncCfg();
    setSync('idle', '', syncCfg.at);
  } catch (e) {
    if (e.code === 'network') {
      setSync('offline', e.message);
    } else {
      notice = `Sincronizzazione: ${e.message || 'errore imprevisto.'}`;
      setSync('error', e.message || 'Errore imprevisto.');
    }
  } finally {
    syncing = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync(500);
    }
  }
}
