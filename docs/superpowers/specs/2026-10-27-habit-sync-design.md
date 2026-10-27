# Habit Tracker — Sincronizzazione (fase 2)

Data: 2026-10-27
Stato: approvato dall'utente

## Obiettivo
Sincronizzare automaticamente i dati tra iPhone e PC, mantenendo offline-first e privacy.

## Scelta
GitHub Gist segreto sull'account dell'utente, contenuto cifrato lato client.
Scartati: OneDrive (registrazione app Azure, login OAuth fragile nelle PWA iOS), iCloud (nessuna API web), backend terzi.

## Formato nel Gist
File `habits-sync.json`, Gist `public: false`:

```json
{ "app": "habits", "v": 1,
  "kdf": { "name": "PBKDF2-SHA256", "iterations": 310000, "salt": "<base64 16 B>" },
  "iv": "<base64 12 B>", "data": "<base64 AES-256-GCM(JSON documento)>" }
```

- Chiave: PBKDF2-SHA256(password, salt, iterations) → AES-GCM 256. IV nuovo a ogni scrittura.
- Sul dispositivo (`localStorage` `habits.sync`): `{ token, gistId, salt, iterations, key }` (chiave derivata in base64, la password non viene salvata).

## Flussi
- **Collega** (token + password ≥ 8 caratteri):
  - cerca tra i Gist dell'utente quello con `habits-sync.json`;
  - trovato → decifra (errore = "Password errata"), unisce con i dati locali (`mergeDocs`), riscrive;
  - non trovato → nuovo salt, cifra i dati locali, crea il Gist.
- **Sync** (all'avvio, al ritorno online, al ritorno in primo piano, 3 s dopo ogni modifica, subito quando l'app va in background con una sync in attesa, pulsante "Sincronizza ora"):
  scarica → decifra → unisce → carica solo se i dati locali hanno qualcosa di più recente del remoto.
  Modifiche fatte durante la sync vengono preservate (merge finale con lo stato corrente).
- **Scollega**: cancella la configurazione dal dispositivo; Gist e dati restano.

## Errori
| Caso | Stato mostrato |
|---|---|
| rete assente / fetch fallita | "Offline: sincronizzo appena torna la rete" (nessun banner) |
| 401 | "Token non valido o scaduto" + banner |
| Gist cancellato (404) | "Gist non trovato: scollega e ricollega" + banner |
| decifratura fallita | "Password errata" (collega) / "Password cambiata su un altro dispositivo: ricollega" (sync) + banner |
| contenuto non valido | "Dati sincronizzati non validi" + banner |

## Moduli
- `js/crypto.js`: `toB64`, `fromB64`, `randomBytes`, `deriveKey`, `exportKey`, `importKey`, `seal`, `parseEnvelope`, `unseal`.
- `js/sync.js`: `SyncError`, `makeApi(token, fetchFn)`, `connect({...})`, `syncOnce({...})` — nessun accesso a storage/DOM.
- `js/store.js`: configurazione sync, scheduling, stato (`getSync`, `connectSync`, `disconnectSync`, `runSync`, `scheduleSync`, `flushSync`).
- `js/views/settings.js`: sezione "Sincronizzazione".
- `sw.js`: nuovi file in cache, `CACHE = habits-v2`, precache con `cache: 'reload'`.

## Test
- `tests/sync.test.js` con API GitHub simulata in memoria: creazione, secondo dispositivo, password errata, push solo se necessario, contenuto del Gist non leggibile in chiaro, errori HTTP/rete.
- Browser: flusso UI con `fetch` simulato. La prova reale con token la esegue l'utente.
