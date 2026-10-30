// Formatting and escaping helpers shared by views and charts.
import { fromKey } from './logic.js';

// Hue wheel tuned to the app icons (Habits indigo/orchid, Atlas terracotta, the orange/blue/green/purple tiles);
// mid lightness so each reads on both themes. Identity is also carried by icon + name. A 20th swatch is custom.
export const COLORS = [
  '#6a6cf0', '#8b6cf0', '#b07cf0', '#c98ef4', '#e07ab8', '#e8687a', '#d4683d', '#f08c3a', '#f5a94a', '#e9c25a',
  '#a9c45a', '#5cb87a', '#2e9e77', '#36b3a8', '#4fb4d8', '#5ba6f5', '#5b7fe8', '#9a8270', '#8a8fa3',
];
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
