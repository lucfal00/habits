// Entry point: hash router, theme, banner, service worker.
import * as store from './store.js';
import { todayKey } from './logic.js';
import { initTooltips, hideTip } from './charts.js';
import * as today from './views/today.js';
import * as habits from './views/habits.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';

const views = { oggi: today, abitudini: habits, stats, impostazioni: settings };
const main = document.getElementById('view');
const banner = document.getElementById('banner');
let shown = '';
let shownDay = '';

function route() {
  const [name, ...rest] = location.hash.slice(1).split('/');
  return {
    name: views[name] ? name : 'oggi',
    param: rest.length ? decodeURIComponent(rest.join('/')) : '',
  };
}

function render() {
  const doc = store.getDoc();
  const { name, param } = route();
  const root = document.documentElement;
  if (doc.settings.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = doc.settings.theme;

  const notice = store.getNotice();
  banner.hidden = !notice;
  banner.querySelector('span').textContent = notice;

  document.querySelectorAll('.tabbar a').forEach((a) => {
    const on = a.dataset.view === name;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  hideTip();
  main.onclick = main.onchange = main.oninput = null;   // views re-attach their own
  shownDay = todayKey();
  views[name].render(main, { doc, param, today: shownDay, refresh: render });

  const key = `${name}/${param}`;
  if (key !== shown) {
    window.scrollTo(0, 0);
    shown = key;
  }
}

store.load();
store.onChange(render);
initTooltips();
banner.querySelector('button').onclick = store.clearNotice;
addEventListener('hashchange', render);
// Re-render after midnight when the app comes back to the foreground (not on every switch: keeps open forms).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && todayKey() !== shownDay) render();
});
render();

navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js');
}
