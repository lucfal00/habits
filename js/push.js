// Notifications: subscribe this device to the reminders service, keep the service told about the plan and today's
// progress (from every device, so ticking a habit on the PC silences the phone too), and leave habit names and the
// week summary where the service worker reads them to write the notification text.
import { PUSH } from './push-config.js';
import { todayKey } from './logic.js';
import { buildPlan, buildState, buildMirror } from './remind.js';
import { getPushPrefs, setPushPrefs } from './store.js';

export const MIRROR_CACHE = 'habits-notify';       // same names in sw.js
const MIRROR_URL = './notify.json';

export const configured = () => !!PUSH;

/** 'ok' | 'home' (iPhone: only from the app on the Home screen) | 'no' */
export function support() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok';
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone ? 'home' : 'no';
}

export const isOn = () => !!getPushPrefs().on && 'Notification' in window && Notification.permission === 'granted';

class PushError extends Error {}

async function call(path, body, token) {
  let res;
  try {
    res = await fetch(PUSH.url + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PushError('Non riesco a contattare il servizio delle notifiche. Controlla la connessione e riprova.');
  }
  if (res.status === 401) throw new PushError('Il servizio non riconosce il tuo account GitHub: ricollega la sincronizzazione.');
  if (!res.ok) throw new PushError('Il servizio delle notifiche ha risposto con un errore. Riprova tra poco.');
  return res.json();
}

const key = () => Uint8Array.from(atob(PUSH.key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Must start from a tap: iOS only asks for permission inside a user gesture. */
export async function enable(token, doc) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new PushError('Permesso negato: consenti le notifiche di Habits nelle impostazioni del dispositivo.');
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() });
  const prefs = getPushPrefs();
  prefs.device ||= crypto.getRandomValues(new Uint32Array(2)).join('-');
  await call('/subscribe', { device: prefs.device, subscription: sub.toJSON() }, token);
  setPushPrefs({ ...prefs, on: true });
  await refresh(doc, token);
  await call('/test', { device: prefs.device }, token);
}

export async function disable(token) {
  const prefs = getPushPrefs();
  setPushPrefs({ ...prefs, on: false });
  const reg = await navigator.serviceWorker.ready;
  await (await reg.pushManager.getSubscription())?.unsubscribe();
  if (token && prefs.device) await call('/unsubscribe', { device: prefs.device }, token).catch(() => {});
}

/** After every change: refresh the local names / summary, and tell the service (best effort, offline is fine). */
export async function refresh(doc, token) {
  const today = todayKey();
  try {
    const cache = await caches.open(MIRROR_CACHE);
    await cache.put(MIRROR_URL, new Response(JSON.stringify(buildMirror(doc, today)), {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch { /* no Cache API: notifications fall back to generic text */ }
  if (!token) return;
  const body = { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, plan: buildPlan(doc), state: buildState(doc, today) };
  await call('/sync', body, token).catch(() => {});
}
