# Habit Sync Implementation Plan

> Esecuzione inline. Codice completo nei file indicati. Spec: `docs/superpowers/specs/2026-10-27-habit-sync-design.md`.

**Goal:** sincronizzazione automatica cifrata via GitHub Gist.
**Global Constraints:** nessuna dipendenza; WebCrypto (`globalThis.crypto.subtle`, disponibile anche in Node 24); `fetch` iniettabile per i test; `cache: 'no-store'` sulle chiamate API.

### Task 1: `js/crypto.js` + `js/sync.js` (TDD)
- [ ] `tests/sync.test.js` (API finta in memoria) → FAIL
- [ ] Implementare crypto e sync → `npm test` PASS → commit

### Task 2: integrazione
- [ ] `store.js`: `persist()` vs `save()` (solo `save` pianifica la sync), config `habits.sync`, stato, `runSync` con merge finale sullo stato corrente
- [ ] `app.js`: sync all'avvio, `online`, `visibilitychange` (visibile → sync, nascosto → flush)
- [ ] `settings.js`: sezione collega/stato/sincronizza ora/scollega; link creazione token `https://github.com/settings/tokens/new?scopes=gist&description=Habits%20sync`
- [ ] `sw.js`: nuovi file, `habits-v2`, precache `cache: 'reload'`; README → commit

### Task 3: verifica
- [ ] `npm test`; browser con `fetch` simulato: collega, sync dopo modifica, password errata, scollega, nessun errore console
