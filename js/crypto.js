// Client-side encryption for sync: PBKDF2-SHA256 → AES-256-GCM (WebCrypto, browser and Node).
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const ITERATIONS = 310000;

export function toB64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
  );
}

export const exportKey = async (key) => toB64(await subtle.exportKey('raw', key));

export const importKey = (b64) => subtle.importKey('raw', fromB64(b64), 'AES-GCM', true, ['encrypt', 'decrypt']);

/** Encrypt obj into the JSON envelope stored in the Gist. */
export async function seal(key, salt, iterations, obj) {
  const iv = randomBytes(12);
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return JSON.stringify({
    app: 'habits',
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: toB64(salt) },
    iv: toB64(iv),
    data: toB64(data),
  });
}

/** Parse an envelope; throws if it is not one of ours. */
export function parseEnvelope(text) {
  const e = JSON.parse(text);
  if (e?.app !== 'habits' || e.v !== 1 || !e.kdf?.salt || !e.iv || !e.data) throw new Error('not a habits envelope');
  return e;
}

/** Decrypt an envelope; throws (OperationError) on a wrong key. */
export async function unseal(key, env) {
  const buf = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.data));
  return JSON.parse(dec.decode(buf));
}
