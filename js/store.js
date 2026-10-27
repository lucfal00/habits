// Persistence: the only module that touches localStorage. Emits 'change' after every mutation.
import { emptyDoc, validateDoc, mergeDocs, activeHabits, todayKey } from './logic.js';

const KEY = 'habits.v1';
const bus = new EventTarget();
let doc = emptyDoc();
let notice = '';          // banner message
let readOnly = false;

export function load() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    readOnly = true;
    notice = 'Memoria del browser non disponibile: i dati non verranno salvati.';
    return;
  }
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    if (!validateDoc(d)) throw new Error('invalid');
    d.settings = { theme: 'auto', lastBackup: 0, ...d.settings };
    doc = d;
  } catch {
    try { localStorage.setItem(KEY + '.corrupt', raw); } catch { /* best effort */ }
    notice = 'I dati salvati erano danneggiati: ne ho conservato una copia e sono ripartito da zero. Puoi importare un backup.';
  }
}

export const getDoc = () => doc;
export const getNotice = () => notice;
export const onChange = (fn) => bus.addEventListener('change', fn);

const emit = () => bus.dispatchEvent(new Event('change'));

export function clearNotice() {
  notice = '';
  emit();
}

function save() {
  if (!readOnly) {
    try {
      localStorage.setItem(KEY, JSON.stringify(doc));
    } catch {
      notice = 'Spazio esaurito: impossibile salvare. Esporta un backup.';
    }
  }
  emit();
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

export function setSetting(k, v) {
  doc.settings[k] = v;
  save();
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
  save();
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
