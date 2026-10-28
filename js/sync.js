// Encrypted sync through a secret GitHub Gist. No storage or DOM: callers own state.
import { mergeDocs, validateDoc } from './logic.js';
import {
  ITERATIONS, deriveKey, exportKey, importKey, seal, unseal, parseEnvelope, randomBytes, fromB64, toB64,
} from './crypto.js';

const API = 'https://api.github.com';
const FILE = 'habits-sync.json';

export class SyncError extends Error {
  /** code: network | token | missing | http | password | format */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function makeApi(token, fetchFn = (...a) => fetch(...a)) {
  async function call(method, path, body) {
    let res;
    try {
      res = await fetchFn(API + path, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError('network', 'Offline: sincronizzo appena torna la rete.');
    }
    if (res.status === 401) throw new SyncError('token', 'Token GitHub non valido o scaduto.');
    if (res.status === 404) throw new SyncError('missing', 'Gist di sincronizzazione non trovato: scollega e ricollega.');
    if (!res.ok) throw new SyncError('http', `GitHub ha risposto con errore ${res.status}.`);
    return res.json();
  }

  return {
    async findGist() {
      const list = await call('GET', '/gists?per_page=100');
      return list.find((g) => g.files?.[FILE])?.id ?? null;
    },
    async read(id) {
      const f = (await call('GET', `/gists/${id}`)).files?.[FILE];
      if (!f) throw new SyncError('missing', 'Gist di sincronizzazione non trovato: scollega e ricollega.');
      if (!f.truncated) return f.content;
      try {
        return await (await fetchFn(f.raw_url, { cache: 'no-store' })).text();
      } catch {
        throw new SyncError('network', 'Offline: sincronizzo appena torna la rete.');
      }
    },
    async create(content) {
      const g = await call('POST', '/gists', {
        description: 'Habits – dati sincronizzati (cifrati)', public: false, files: { [FILE]: { content } },
      });
      return g.id;
    },
    async write(id, content) {
      await call('PATCH', `/gists/${id}`, { files: { [FILE]: { content } } });
    },
  };
}

async function readRemote(api, gistId, key, wrongKeyMsg) {
  let env;
  try {
    env = parseEnvelope(await api.read(gistId));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError('format', 'Dati sincronizzati non validi.');
  }
  let remote;
  try {
    remote = await unseal(key, env);
  } catch {
    throw new SyncError('password', wrongKeyMsg);
  }
  if (!validateDoc(remote)) throw new SyncError('format', 'Dati sincronizzati non validi.');
  return remote;
}

const remoteIsBehind = (remote, local) => {
  const r = mergeDocs(remote, local);
  return r.habits + r.entries + r.journal + r.sleep + r.reminders > 0;
};

/** Link this device: join the existing sync gist (merging data) or create it. */
export async function connect({ token, password, local, api = makeApi(token), iterations = ITERATIONS }) {
  const gistId = await api.findGist();
  if (!gistId) {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, iterations);
    const id = await api.create(await seal(key, salt, iterations, local));
    return { cfg: { token, gistId: id, salt: toB64(salt), iterations, key: await exportKey(key) }, doc: local };
  }
  const env = parseEnvelope(await api.read(gistId));
  const salt = fromB64(env.kdf.salt);
  const key = await deriveKey(password, salt, env.kdf.iterations);
  const remote = await readRemote(api, gistId, key, 'Password errata: non riesco a decifrare i dati sincronizzati.');
  const { doc } = mergeDocs(local, remote);
  if (remoteIsBehind(remote, doc)) await api.write(gistId, await seal(key, salt, env.kdf.iterations, doc));
  return {
    cfg: { token, gistId, salt: env.kdf.salt, iterations: env.kdf.iterations, key: await exportKey(key) },
    doc,
  };
}

/** Pull, merge, push if the remote lacks newer local changes. */
export async function syncOnce({ cfg, local, api = makeApi(cfg.token) }) {
  const key = await importKey(cfg.key);
  const remote = await readRemote(api, cfg.gistId, key,
    'La password è stata cambiata su un altro dispositivo: scollega e ricollega.');
  const { doc } = mergeDocs(local, remote);
  const pushed = remoteIsBehind(remote, doc);
  if (pushed) await api.write(cfg.gistId, await seal(key, fromB64(cfg.salt), cfg.iterations, doc));
  return { doc, pushed };
}
