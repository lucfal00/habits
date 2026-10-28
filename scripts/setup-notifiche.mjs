// One-time setup of the reminders service on your Cloudflare account:  npm run notifiche
// Logs in (browser), creates the storage, generates the push keys, publishes the worker and writes
// js/push-config.js. Safe to run again: it reuses the storage and the keys it created the first time.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { b64u } from '../worker/webpush.js';

const OWNER = 'lucfal00';
const ORIGINS = 'https://lucfal00.github.io,http://localhost:8080';
const SUBJECT = 'https://lucfal00.github.io/habits/';
const NAME = 'habits-notifiche';
const DIR = 'worker';
const KEYS = join(DIR, '.vapid.json');            // gitignored: the private key never leaves this PC and Cloudflare
const TOML = join(DIR, 'wrangler.toml');          // gitignored: tied to your account

const say = (s) => console.log(`\n\x1b[36m▸ ${s}\x1b[0m`);
const fail = (s) => {
  console.error(`\n\x1b[31m✗ ${s}\x1b[0m\n`);
  process.exit(1);
};

/** Run wrangler; capture = return stdout (prompts still go to the terminal through stderr / stdin). */
function wrangler(args, { input, capture = false, env = {} } = {}) {
  const r = spawnSync('npx', ['--yes', 'wrangler@4', ...args], {
    cwd: DIR,
    input,
    encoding: 'utf8',
    stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'],
    shell: process.platform === 'win32',            // npx is npx.cmd on Windows
    env: { ...process.env, ...env },
  });
  return { ok: r.status === 0, out: r.stdout || '' };
}

say('1/5 · Accesso a Cloudflare');
if (!/You are logged in/i.test(wrangler(['whoami'], { capture: true }).out)) {
  console.log('Si apre il browser: accedi (anche con GitHub) e clicca "Allow".');
  if (!wrangler(['login']).ok) fail('Accesso non riuscito. Riprova con: npm run notifiche');
}

say('2/5 · Archivio dei promemoria');
let kvId = existsSync(TOML) ? /id = "([0-9a-f]{32})"/.exec(readFileSync(TOML, 'utf8'))?.[1] : null;
if (!kvId) {
  const r = wrangler(['kv', 'namespace', 'create', NAME], { capture: true });
  kvId = /"?id"?\s*[:=]\s*"([0-9a-f]{32})"/.exec(r.out)?.[1];
  if (!kvId) fail(`Non riesco a creare l'archivio.\n${r.out}`);
}
console.log(`Archivio: ${kvId}`);

say('3/5 · Chiavi per le notifiche');
let keys = existsSync(KEYS) ? JSON.parse(readFileSync(KEYS, 'utf8')) : null;
if (!keys) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  keys = {
    publicKey: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
  writeFileSync(KEYS, JSON.stringify(keys, null, 2));
}

writeFileSync(TOML, `name = "${NAME}"
main = "index.js"
compatibility_date = "2025-01-01"

[triggers]
crons = ["*/5 * * * *"]

[[kv_namespaces]]
binding = "STORE"
id = "${kvId}"

[vars]
OWNER = "${OWNER}"
ORIGINS = "${ORIGINS}"
SUBJECT = "${SUBJECT}"
VAPID_PUBLIC = "${keys.publicKey}"
`);

say('4/5 · Pubblicazione');
const outDir = mkdtempSync(join(tmpdir(), 'habits-wrangler-'));
const outFile = join(outDir, 'out.json');
if (!wrangler(['deploy'], { env: { WRANGLER_OUTPUT_FILE_PATH: outFile } }).ok) fail('Pubblicazione non riuscita (vedi sopra).');
let url = null;
try {
  for (const line of readFileSync(outFile, 'utf8').split('\n')) {
    const e = line.trim() && JSON.parse(line);
    if (e?.type === 'deploy') url = e.targets?.find((t) => t.endsWith('.workers.dev')) || e.targets?.[0] || url;
  }
} catch { /* fall back to asking */ }
rmSync(outDir, { recursive: true, force: true });
if (!url) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  url = (await rl.question('Incolla qui l’indirizzo …workers.dev che vedi sopra: ')).trim();
  rl.close();
}
url = url.replace(/\/+$/, '');
if (!/^https:\/\/[\w.-]+$/.test(url)) fail(`Indirizzo non valido: ${url}`);
if (!wrangler(['secret', 'put', 'VAPID_PRIVATE'], { input: JSON.stringify(keys.privateJwk) }).ok) {
  fail('Non riesco a salvare la chiave segreta (vedi sopra).');
}

say('5/5 · Controllo');
let health = '';
for (let i = 0; i < 10 && !health.includes('ok'); i++) {
  try {
    health = await (await fetch(url)).text();
  } catch { /* the first seconds after a deploy */ }
  if (!health.includes('ok')) await new Promise((r) => setTimeout(r, 3000));
}
if (!health.includes('ok')) fail(`Il servizio non risponde ancora su ${url}. Riprova tra un minuto: npm run notifiche`);

writeFileSync('js/push-config.js', `// Written by scripts/setup-notifiche.mjs: where the reminders service lives and its public push key.
export const PUSH = { url: '${url}', key: '${keys.publicKey}' };
`);
console.log(`\n\x1b[32m✓ Fatto! Servizio attivo su ${url}\x1b[0m\nScrivi a Claude: "notifiche pronte".\n`);
