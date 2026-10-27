# Habit Tracker Implementation Plan

> Esecuzione inline in questa sessione. Il codice completo vive nei file indicati (non duplicato qui per efficienza).

**Goal:** PWA offline per abitudini con grafici, installabile su iPhone e PC.
**Architecture:** HTML/CSS/JS ES modules senza build; logica pura in `js/logic.js`, persistenza in `js/store.js`, grafici SVG in `js/charts.js`, una vista per tab.
**Tech Stack:** HTML, CSS, JS (ES2022), Service Worker, `node --test` (Node 24).
**Spec:** `docs/superpowers/specs/2026-10-27-habit-tracker-design.md`

## Global Constraints
- Nessuna dipendenza esterna, nessun build step.
- Date locali `YYYY-MM-DD`; settimana lun–dom; `weekday` 1 = lunedì.
- UI in italiano; input testo `font-size ≥ 16px` (no zoom iOS).
- Tutto il testo utente/import passa da `esc()`; colori da `safeColor()`.

---

### Task 1: `js/logic.js` + test (TDD)
**Files:** Create `package.json`, `tests/logic.test.js`, `js/logic.js`
**Produces:**
- Date: `toKey(Date)`, `fromKey(key)`, `todayKey(now?)`, `addDays(key,n)`, `weekday(key)→1..7`, `weekStart(key)`, `monthStart(key)`, `monthEnd(key)`, `addMonths(key,n)→month start`
- Doc: `emptyDoc()`, `isActive(h)`, `activeHabits(doc)` (ordinate per `order`), `targetOf(h)`, `valueOf(doc,key,id)`
- Calcolo: `fraction(h,v)`, `isDone(h,v)`, `isScheduled(h,key)`, `weekCount(doc,h,key)`, `dayPercent(doc,key)→null|0..1`, `habitDayFraction(doc,h,key)→null|0..1`, `currentStreak(doc,h,today)`, `bestStreak(doc,h,today)`, `periodPercent(doc,habits,from,to,today)→null|0..1`
- Backup: `validateDoc(d)→bool`, `mergeDocs(local,incoming)→{doc,habits,entries}`

- [ ] Scrivere test: date (fine anno, febbraio, cambio ora 25/10), fraction, isScheduled, streak giornaliera/giorni specifici/settimanale/cambio anno, record, dayPercent, periodPercent, merge, validate
- [ ] `npm test` → FAIL (modulo assente)
- [ ] Implementare `js/logic.js`
- [ ] `npm test` → PASS
- [ ] Commit

### Task 2: `js/store.js`, `js/ui.js`, `js/charts.js`
**Consumes:** Task 1.
**Produces:**
- store: `load()`, `getDoc()`, `getNotice()`, `clearNotice()`, `onChange(fn)`, `createHabit(fields)`, `updateHabit(id,patch)`, `moveHabit(id,dir)`, `setEntry(key,id,v)`, `setSetting(k,v)`, `exportBackup()→Promise<bool>`, `importBackup(file)→Promise<{habits,entries}>`
- ui: `esc(s)`, `safeColor(c)`, `fmtDay(key)`, `fmtShort(key)`, `fmtNum(n)`, `pct(f)`, `freqLabel(h)`, `COLORS`, `DAY_LETTERS`, `MONTHS`
- charts (stringhe SVG): `ring(f,color,size,stroke)`, `heatmap(valueAt,color,today)`, `lineChart(points,color)`, `barChart(points,target,color)`
- [ ] Implementare; verifica in Task 5 (browser). Commit

### Task 3: shell e PWA
**Files:** `index.html`, `style.css`, `js/app.js`, `manifest.webmanifest`, `sw.js`, `scripts/make-icons.mjs` → `icons/*.png`, `icons/icon.svg`, `scripts/serve.mjs`, `.claude/launch.json`
- `app.js`: router hash `#oggi|#abitudini[/id|/nuova]|#stats[/id]|#impostazioni`; ogni vista `render(el,{doc,param,today,refresh})`; azzera `onclick/onchange/oninput` di `#view` prima di ogni render; tema da `settings.theme`; banner da `getNotice()`; registra SW su http(s); `navigator.storage.persist()`.
- `sw.js`: precache, risposta dalla cache con aggiornamento in background, pulizia cache vecchie.
- [ ] `node scripts/make-icons.mjs` → 3 PNG. Commit

### Task 4: viste
**Files:** `js/views/today.js`, `habits.js`, `stats.js`, `settings.js` (comportamento: spec §4).
- [ ] Implementare. Commit

### Task 5: verifica
- [ ] `npm test` PASS
- [ ] Browser (viewport mobile, `node scripts/serve.mjs`): crea abitudine sì/no, quantitativa, settimanale; registra; naviga giorni; statistiche e dettaglio; tema scuro; export/import (merge); nessun errore console; SW attivo e app caricata offline.

### Task 6: README
- [ ] Guida in italiano: uso, backup, pubblicazione GitHub Pages, installazione iPhone/PC. Commit
