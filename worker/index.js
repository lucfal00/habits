// Habits reminders service (Cloudflare Worker + KV). The app sends its plan (ids, days, times) and today's
// progress; every 5 minutes the cron sends a push for whatever is due. Single user: every call carries the GitHub
// token the app already uses for sync, checked against the configured owner. Never sees names, mood or sleep.
import { dueReminders, localNow } from '../js/remind.js';
import { weekStart } from '../js/logic.js';
import { sendPush } from './webpush.js';

const MAX_SUBS = 6;              // newest kept: a few devices plus re-installs
const MAX_PLAN = 300;

const reply = (data, status, cors) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', ...cors },
});

function corsFor(req, env) {
  const origin = req.headers.get('Origin') || '';
  if (!env.ORIGINS.split(',').map((o) => o.trim()).includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The token must belong to the owner's GitHub account; a positive check is remembered for a day (hash only). */
async function authorised(req, env) {
  const m = /^Bearer (\S+)$/.exec(req.headers.get('Authorization') || '');
  if (!m) return false;
  const key = `auth:${await sha256(m[1])}`;
  if (await env.STORE.get(key)) return true;
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${m[1]}`, Accept: 'application/vnd.github+json', 'User-Agent': 'habits-notifiche' },
  });
  if (!res.ok) return false;
  const { login } = await res.json();
  if (String(login).toLowerCase() !== env.OWNER.toLowerCase()) return false;
  await env.STORE.put(key, '1', { expirationTtl: 86400 });
  return true;
}

const vapidOf = (env) => ({ privateJwk: JSON.parse(env.VAPID_PRIVATE), publicKey: env.VAPID_PUBLIC, subject: env.SUBJECT });

async function push(sub, payload, env) {
  try {
    return await sendPush(sub, payload, vapidOf(env));
  } catch {
    return 0;                                     // network error: try again at the next reminder
  }
}

const validSub = (s) => s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://')
  && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string';

async function handle(req, env, cors) {
  const path = new URL(req.url).pathname;
  if (req.method === 'GET' && path === '/') return new Response('Habits notifiche: ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405, cors);
  if (!(await authorised(req, env))) return reply({ error: 'auth' }, 401, cors);
  let body;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'json' }, 400, cors);
  }
  const device = typeof body.device === 'string' ? body.device.slice(0, 64) : '';
  const subs = (await env.STORE.get('subs', 'json')) || [];

  if (path === '/subscribe') {
    if (!device || !validSub(body.subscription)) return reply({ error: 'subscription' }, 400, cors);
    const { endpoint, keys } = body.subscription;
    const next = subs.filter((s) => s.device !== device && s.endpoint !== endpoint);
    next.push({ device, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, at: Date.now() });
    await env.STORE.put('subs', JSON.stringify(next.slice(-MAX_SUBS)));
    return reply({ ok: true }, 200, cors);
  }
  if (path === '/unsubscribe') {
    await env.STORE.put('subs', JSON.stringify(subs.filter((s) => s.device !== device)));
    return reply({ ok: true }, 200, cors);
  }
  if (path === '/sync') {
    const { tz, plan, state } = body;
    if (!Array.isArray(plan) || plan.length > MAX_PLAN || typeof tz !== 'string') return reply({ error: 'plan' }, 400, cors);
    await env.STORE.put('plan', JSON.stringify({ tz, plan, state, at: Date.now() }));
    return reply({ ok: true }, 200, cors);
  }
  if (path === '/test') {
    const sub = subs.find((s) => s.device === device);
    if (!sub) return reply({ error: 'device' }, 404, cors);
    const status = await push(sub, { kind: 'test' }, env);
    return reply({ ok: status >= 200 && status < 300, status }, 200, cors);
  }
  return reply({ error: 'path' }, 404, cors);
}

/** Cron: send what is due now (once per reminder per day) to every device; drop subscriptions that are gone. */
async function run(env, now = Date.now()) {
  const data = await env.STORE.get('plan', 'json');
  const subs = (await env.STORE.get('subs', 'json')) || [];
  if (!data || !subs.length) return;
  const local = localNow(now, data.tz || 'Europe/Rome');
  let sent = await env.STORE.get('sent', 'json');
  if (sent?.date !== local.date) sent = { date: local.date, ids: [] };
  const due = dueReminders(data.plan, data.state, local, sent.ids);
  if (!due.length) return;
  const gone = new Set();
  for (const p of due) {
    for (const s of subs) {
      const status = await push(s, { kind: p.kind, id: p.id, date: local.date, week: weekStart(local.date) }, env);
      if (status === 404 || status === 410) gone.add(s.endpoint);
    }
    sent.ids.push(p.id);
  }
  await env.STORE.put('sent', JSON.stringify(sent));
  if (gone.size) await env.STORE.put('subs', JSON.stringify(subs.filter((s) => !gone.has(s.endpoint))));
}

export default {
  async fetch(req, env) {
    const cors = corsFor(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    return handle(req, env, cors);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, event.scheduledTime));
  },
};
