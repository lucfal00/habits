import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64u, fromB64u, hkdf, encryptPayload, vapidAuth } from '../worker/webpush.js';

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const concat = (...p) => Uint8Array.from(p.flatMap((x) => [...x]));

/** The browser's side of RFC 8291, written independently from the sender to check it. */
async function decrypt(body, uaKeys, auth) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  assert.equal(rs, 4096);
  const uaPublic = new Uint8Array(await subtle.exportKey('raw', uaKeys.publicKey));
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  assert.equal(plain.at(-1), 2);                                   // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1));
}

test('hkdf matches RFC 5869 test case 1 (first 32 bytes)', async () => {
  const hex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16));
  const okm = await hkdf(hex('000102030405060708090a0b0c'), hex('0b'.repeat(22)), hex('f0f1f2f3f4f5f6f7f8f9'), 32);
  assert.equal(Buffer.from(okm).toString('hex'), '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf');
});

test('encryptPayload: the subscriber decrypts the exact payload', async () => {
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const sub = { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: b64u(await subtle.exportKey('raw', ua.publicKey)), auth: b64u(auth) } };
  const body = await encryptPayload(sub, JSON.stringify({ kind: 'habit', id: 'h_1' }));
  assert.deepEqual(JSON.parse(await decrypt(body, ua, auth)), { kind: 'habit', id: 'h_1' });
});

test('vapidAuth: ES256 JWT for the push service origin, verifiable with the public key', async () => {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = b64u(await subtle.exportKey('raw', pair.publicKey));
  const privateJwk = await subtle.exportKey('jwk', pair.privateKey);
  const now = Date.UTC(2026, 9, 28);
  const h = await vapidAuth('https://web.push.apple.com/abc', { privateJwk, publicKey, subject: 'https://lucfal00.github.io/habits/' }, now);
  const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, publicKey);
  const [head, body, sig] = jwt.split('.');
  const claims = JSON.parse(new TextDecoder().decode(fromB64u(body)));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.exp, now / 1000 + 12 * 3600);
  assert.equal(claims.sub, 'https://lucfal00.github.io/habits/');
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64u(sig), enc.encode(`${head}.${body}`));
  assert.equal(ok, true);
});

test('encryptPayload reproduces the RFC 8291 appendix A example', async () => {
  const asPublic = fromB64u('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const jwk = {
    kty: 'EC', crv: 'P-256', d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    x: b64u(asPublic.slice(1, 33)), y: b64u(asPublic.slice(33)),
  };
  const local = {
    privateKey: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
  const sub = { keys: {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  } };
  const body = await encryptPayload(sub, 'When I grow up, I want to be a watermelon', { salt: fromB64u('DGv6ra1nlYgDCS1FRnbzlw'), local });
  assert.equal(b64u(body), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});
