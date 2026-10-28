import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { b64u } from '../worker/webpush.js';

const { subtle } = globalThis.crypto;
const realFetch = globalThis.fetch;
let pushes;
let githubLogin;

function kv() {
  const m = new Map();
  return {
    m,
    async get(k, type) {
      const v = m.get(k);
      return v === undefined ? null : type === 'json' ? JSON.parse(v) : v;
    },
    async put(k, v) { m.set(k, v); },
  };
}

async function makeEnv() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  return {
    STORE: kv(),
    OWNER: 'lucfal00',
    ORIGINS: 'https://lucfal00.github.io',
    SUBJECT: 'https://lucfal00.github.io/habits/',
    VAPID_PUBLIC: b64u(await subtle.exportKey('raw', pair.publicKey)),
    VAPID_PRIVATE: JSON.stringify(await subtle.exportKey('jwk', pair.privateKey)),
  };
}

async function browserSub(endpoint) {
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { endpoint, keys: { p256dh: b64u(await subtle.exportKey('raw', ua.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };
}

const call = (env, path, body, token = 'tok') => worker.fetch(new Request(`https://w.example${path}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, Origin: 'https://lucfal00.github.io', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}), env);

const cron = (env, iso) => new Promise((resolve) => {
  worker.scheduled({ scheduledTime: Date.parse(iso) }, env, { waitUntil: (p) => p.then(resolve) });
});

beforeEach(() => {
  pushes = [];
  githubLogin = 'lucfal00';
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u === 'https://api.github.com/user') {
      return new Response(JSON.stringify({ login: githubLogin }), { status: init.headers.Authorization === 'Bearer tok' ? 200 : 401 });
    }
    pushes.push(u);
    return new Response(null, { status: u.includes('gone') ? 410 : 201 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

test('worker: only the owner GitHub account may call it; CORS for the app origin', async () => {
  const env = await makeEnv();
  assert.equal((await call(env, '/sync', { tz: 'Europe/Rome', plan: [] }, 'other')).status, 401);
  githubLogin = 'someone-else';
  assert.equal((await call(env, '/sync', { tz: 'Europe/Rome', plan: [] })).status, 401);
  githubLogin = 'lucfal00';
  const res = await call(env, '/sync', { tz: 'Europe/Rome', plan: [] });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://lucfal00.github.io');
  assert.ok([...env.STORE.m.keys()].some((k) => k.startsWith('auth:')));        // cached, as a hash
  assert.equal([...env.STORE.m.keys()].some((k) => k.includes('tok')), false);
});

test('worker: cron pushes due reminders once to every device and drops gone subscriptions', async () => {
  const env = await makeEnv();
  await call(env, '/subscribe', { device: 'phone', subscription: await browserSub('https://web.push.apple.com/p') });
  await call(env, '/subscribe', { device: 'old', subscription: await browserSub('https://wns.example/gone') });
  const plan = [{ id: 'a', kind: 'habit', time: '22:00', from: '2026-10-01', days: null, weekly: false, pauses: [] },
    { id: 'mood', kind: 'mood', time: '21:30' }];
  await call(env, '/sync', { tz: 'Europe/Rome', plan, state: { date: '2026-10-28', done: [], weekDone: [], mood: true } });

  await cron(env, '2026-10-28T20:31:00Z');                  // 21:31 in Rome: mood already logged
  assert.deepEqual(pushes, []);
  await cron(env, '2026-10-28T21:00:00Z');                  // 22:00 in Rome
  assert.deepEqual(pushes.sort(), ['https://web.push.apple.com/p', 'https://wns.example/gone']);
  assert.deepEqual(JSON.parse(env.STORE.m.get('subs')).map((s) => s.device), ['phone']);
  pushes = [];
  await cron(env, '2026-10-28T21:05:00Z');                  // still in the window: not sent twice
  assert.deepEqual(pushes, []);

  const t = await call(env, '/test', { device: 'phone' });
  assert.deepEqual(await t.json(), { ok: true, status: 201 });
});
