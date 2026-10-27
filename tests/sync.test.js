import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import { connect, syncOnce, makeApi, SyncError } from '../js/sync.js';

const IT = 1000;   // fast KDF for tests

// In-memory stand-in for the Gist API used by connect/syncOnce.
function fakeApi() {
  const gists = new Map();
  const calls = { create: 0, write: 0 };
  return {
    gists,
    calls,
    async findGist() { return gists.keys().next().value ?? null; },
    async read(id) {
      if (!gists.has(id)) throw new SyncError('missing', 'Gist non trovato');
      return gists.get(id);
    },
    async create(content) {
      const id = `g${gists.size + 1}`;
      gists.set(id, content);
      calls.create++;
      return id;
    },
    async write(id, content) {
      gists.set(id, content);
      calls.write++;
    },
  };
}

const habit = (o = {}) => ({
  id: 'a', name: 'Segreto', emoji: '', color: '#6366f1', type: 'check', target: 1, unit: '',
  freq: { kind: 'daily' }, start: '2026-10-01', order: 0, archived: false, deleted: false, updatedAt: 1, ...o,
});
function docWith(habits, entries = {}) {
  const d = L.emptyDoc();
  d.habits = habits;
  d.entries = entries;
  return d;
}

test('first device creates an encrypted gist', async () => {
  const api = fakeApi();
  const local = docWith([habit()], { '2026-10-27': { a: { v: 1, t: 10 } } });
  const { cfg, doc } = await connect({ token: 't', password: 'password1', local, api, iterations: IT });
  assert.equal(api.calls.create, 1);
  assert.equal(cfg.gistId, 'g1');
  assert.equal(cfg.token, 't');
  assert.equal('password' in cfg, false);
  assert.deepEqual(doc, local);
  const content = api.gists.get('g1');
  assert.equal(content.includes('Segreto'), false);
  assert.equal(JSON.parse(content).app, 'habits');
});

test('second device merges remote data and uploads the union', async () => {
  const api = fakeApi();
  const a = await connect({ token: 't', password: 'password1', local: docWith([habit()]), api, iterations: IT });
  const bLocal = docWith([habit({ id: 'b', name: 'Altro', order: 1 })], { '2026-10-27': { b: { v: 1, t: 20 } } });
  const b = await connect({ token: 't', password: 'password1', local: bLocal, api, iterations: IT });
  assert.equal(b.cfg.gistId, a.cfg.gistId);
  assert.deepEqual(b.doc.habits.map((h) => h.id).sort(), ['a', 'b']);
  const r = await syncOnce({ cfg: a.cfg, local: a.doc, api });
  assert.deepEqual(r.doc.habits.map((h) => h.id).sort(), ['a', 'b']);
  assert.equal(r.doc.entries['2026-10-27'].b.v, 1);
});

test('wrong password is rejected on connect', async () => {
  const api = fakeApi();
  await connect({ token: 't', password: 'password1', local: docWith([habit()]), api, iterations: IT });
  await assert.rejects(
    connect({ token: 't', password: 'sbagliata', local: L.emptyDoc(), api, iterations: IT }),
    (e) => e instanceof SyncError && e.code === 'password',
  );
});

test('syncOnce pulls changes and uploads only when local is newer', async () => {
  const api = fakeApi();
  const a = await connect({ token: 't', password: 'password1', local: docWith([habit()]), api, iterations: IT });
  const b = await connect({ token: 't', password: 'password1', local: L.emptyDoc(), api, iterations: IT });
  const writes = api.calls.write;

  const aDoc = structuredClone(a.doc);
  aDoc.entries['2026-10-27'] = { a: { v: 1, t: 50 } };
  const ra = await syncOnce({ cfg: a.cfg, local: aDoc, api });
  assert.equal(ra.pushed, true);
  assert.equal(api.calls.write, writes + 1);

  const rb = await syncOnce({ cfg: b.cfg, local: b.doc, api });
  assert.equal(rb.pushed, false);
  assert.equal(rb.doc.entries['2026-10-27'].a.v, 1);

  const again = await syncOnce({ cfg: a.cfg, local: ra.doc, api });
  assert.equal(again.pushed, false);
  assert.equal(api.calls.write, writes + 1);
});

test('syncOnce reports a password changed elsewhere', async () => {
  const api = fakeApi();
  const a = await connect({ token: 't', password: 'password1', local: L.emptyDoc(), api, iterations: IT });
  const other = await connect({ token: 't', password: 'password1', local: L.emptyDoc(), api, iterations: IT });
  const wrongKey = { ...other.cfg, key: a.cfg.key.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) };
  await assert.rejects(syncOnce({ cfg: wrongKey, local: L.emptyDoc(), api }), (e) => e.code === 'password');
});

// ---- makeApi against a fake fetch -------------------------------------

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

test('makeApi finds the sync gist and reads its content', async () => {
  const seen = [];
  const fetchFn = async (url, opts) => {
    seen.push([opts.method, url, opts.headers.Authorization, opts.cache]);
    if (url.includes('/gists?')) return res(200, [{ id: 'x', files: { 'note.md': {} } }, { id: 'y', files: { 'habits-sync.json': {} } }]);
    if (url.endsWith('/gists/y')) return res(200, { files: { 'habits-sync.json': { content: 'CIPHER', truncated: false } } });
    return res(500, {});
  };
  const api = makeApi('tok', fetchFn);
  assert.equal(await api.findGist(), 'y');
  assert.equal(await api.read('y'), 'CIPHER');
  assert.deepEqual(seen[0].slice(2), ['Bearer tok', 'no-store']);
});

test('makeApi maps HTTP and network failures', async () => {
  const code = async (fetchFn, fn = (api) => api.findGist()) => {
    try {
      await fn(makeApi('tok', fetchFn));
      return 'ok';
    } catch (e) {
      return e.code;
    }
  };
  assert.equal(await code(async () => res(401, {})), 'token');
  assert.equal(await code(async () => res(404, {}), (api) => api.read('z')), 'missing');
  assert.equal(await code(async () => res(500, {})), 'http');
  assert.equal(await code(async () => { throw new TypeError('Failed to fetch'); }), 'network');
});
