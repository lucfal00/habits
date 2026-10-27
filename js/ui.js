// Formatting and escaping helpers shared by views and charts.
import { fromKey } from './logic.js';

// Order validated for adjacent-pair separation (dataviz validate_palette.js); identity also carried by emoji + name.
export const COLORS = ['#6366f1', '#14b8a6', '#f43f5e', '#f59e0b', '#0ea5e9', '#a855f7', '#22c55e', '#f97316'];
export const DAY_LETTERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Habit colours may come from an imported file: only allow #rrggbb. */
export const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : COLORS[0]);

const dayFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtDay = (key) => cap(dayFmt.format(fromKey(key)));
export const fmtShort = (key) => `${+key.slice(8)}/${+key.slice(5, 7)}`;
export const fmtFull = (key) => `${fmtShort(key)}/${key.slice(0, 4)}`;
export const fmtNum = (n) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
export const pct = (f) => (f == null ? '–' : `${Math.round(f * 100)}%`);
export const parseNum = (s) => parseFloat(String(s).replace(',', '.'));

export function freqLabel(h) {
  const f = h.freq;
  if (f.kind === 'daily') return 'Ogni giorno';
  if (f.kind === 'days') return [...f.days].sort().map((d) => DAY_SHORT[d - 1]).join(' · ');
  return f.times === 1 ? '1 volta a settimana' : `${f.times} volte a settimana`;
}
