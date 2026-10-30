// Entry point: hash router, theme, banner, service worker.
import * as store from './store.js';
import { todayKey } from './logic.js';
import { initTooltips, hideTip } from './charts.js';
import * as today from './views/today.js';
import * as habits from './views/habits.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';
import * as mood from './views/mood.js';
import * as sleep from './views/sleep.js';
import * as push from './push.js';

const views = { oggi: today, abitudini: habits, stats, impostazioni: settings, umore: mood, sonno: sleep };
const TAB_OF = { umore: 'oggi', sonno: 'oggi' };                    // screens without their own tab
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

function updateBanner() {
  const notice = store.getNotice();
  banner.hidden = !notice;
  banner.querySelector('span').textContent = notice;
}

function render() {
  const doc = store.getDoc();
  const { name, param } = route();
  const root = document.documentElement;
  if (doc.settings.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = doc.settings.theme;

  updateBanner();

  document.querySelectorAll('.tabbar a').forEach((a) => {
    const on = a.dataset.view === (TAB_OF[name] || name);
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  hideTip();
  main.onclick = main.onchange = main.oninput = main.onkeydown = null;   // views re-attach their own
  shownDay = todayKey();
  views[name].render(main, { doc, param, today: shownDay, refresh: render });

  const key = `${name}/${param}`;
  if (key !== shown) {
    window.scrollTo(0, 0);
    shown = key;
  }
}

let pushTimer = 0;
/** Reminders: tell the service a few seconds after the last change (grouped), on launch and on return. */
function pushLater(ms = 5000) {
  if (!push.configured()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push.refresh(store.getDoc(), store.getSyncToken()), ms);
}

store.load();
store.onChange(render);
store.onChange(() => pushLater());
// Sync status only redraws the screen that shows it, so background syncs never reset an open form.
store.onSync(() => {
  updateBanner();
  if (route().name === 'impostazioni') render();
});
initTooltips();
banner.querySelector('button').onclick = store.clearNotice;
addEventListener('hashchange', render);
addEventListener('online', () => store.runSync());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    store.flushSync();                              // upload before iOS suspends the app
    return;
  }
  if (todayKey() !== shownDay) render();            // after midnight (not on every switch: keeps open forms)
  store.runSync();
  pushLater(1000);
});
render();
store.runSync();
pushLater(1500);
// A tapped notification while the app is open: go to its screen.
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'open') location.hash = new URL(e.data.url).hash;
});

navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js');
}
