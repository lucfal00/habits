# Habit Tracker — Design

Data: 2026-10-27
Stato: approvato in brainstorming, in revisione utente

## 1. Obiettivo

App personale per registrare abitudini e visualizzare i progressi con grafici.
Funziona offline su iPhone e PC, senza account, dati solo sul dispositivo.

## 2. Vincoli

- iPhone (Safari, "Aggiungi a Home") + PC (Chrome/Edge, "Installa app").
- Offline dopo la prima apertura.
- Nessuna libreria esterna, nessun build step: HTML/CSS/JS (ES modules).
- Ospitata su GitHub Pages (HTTPS richiesto da iOS per PWA e service worker).
- Lingua UI: italiano. Settimana: lunedì–domenica.

## 3. Fuori ambito (v1)

- Promemoria/notifiche (non possibili offline su PWA iOS).
- Sincronizzazione cloud automatica (fase 2, stesso formato dati del backup).
- Account, multiutente.

## 4. Schermate

Navigazione a 4 tab in basso (hash router: `#oggi`, `#abitudini`, `#stats`, `#impostazioni`).

### 4.1 Oggi
- Data corrente con frecce ← → per navigare tra i giorni (non oltre oggi).
- Anello avanzamento del giorno (% abitudini giornaliere previste, vedi §6).
- Card per ogni abitudine prevista quel giorno, più le settimanali attive con `start ≤` giorno:
  - sì/no: tocco = fatto/non fatto.
  - quantitativa: pulsanti − / + (passo 1) e tocco sul valore per inserimento diretto; anello valore/obiettivo; unità mostrata.
  - settimanale: badge "X/N questa settimana".
- Banner backup se ultimo export > 7 giorni e ci sono dati.
- Stato vuoto: invito a creare la prima abitudine.

### 4.2 Abitudini
- Lista abitudini attive (riordinabili con frecce su/giù) e sezione "Archiviate".
- Form crea/modifica:
  - nome (obbligatorio, max 40 caratteri), emoji, colore (palette di 8),
  - tipo: sì/no | quantitativa (obiettivo > 0, unità testo libero),
  - frequenza: ogni giorno | giorni specifici (≥ 1 giorno) | N volte a settimana (1–7),
  - data di inizio (default oggi, modificabile per inserire dati passati).
- Azioni: archivia/ripristina, elimina (con conferma; soft delete per il merge).

### 4.3 Statistiche
- Vista globale:
  - andamento % completamento, toggle settimane (ultime 12) / mesi (ultimi 12);
  - heatmap ultimi 365 giorni (% giornaliera globale).
- Dettaglio abitudine (tocco su un'abitudine):
  - streak attuale e record;
  - % ultimi 30 giorni;
  - heatmap ultimi 365 giorni (frazione giornaliera);
  - solo quantitative: grafico a barre ultimi 30 giorni valore vs linea obiettivo.

### 4.4 Impostazioni
- Tema: automatico / chiaro / scuro.
- Esporta backup, Importa backup.
- Data ultimo backup, versione app.

## 5. Modello dati

Un unico documento JSON in `localStorage` (chiave `habits.v1`):

```json
{
  "version": 1,
  "habits": [{
    "id": "h_k3j9x2",
    "name": "Acqua",
    "emoji": "💧",
    "color": "#3b82f6",
    "type": "quantity",
    "target": 8,
    "unit": "bicchieri",
    "freq": { "kind": "daily" },
    "start": "2026-10-27",
    "order": 0,
    "archived": false,
    "deleted": false,
    "updatedAt": 1798364400000
  }],
  "entries": {
    "2026-10-27": { "h_k3j9x2": { "v": 6, "t": 1798364400000 } }
  },
  "settings": { "theme": "auto", "lastBackup": 0 }
}
```

- `type`: `"check"` (target implicito 1, `unit` vuota) | `"quantity"`.
- `freq`: `{kind:"daily"}` | `{kind:"days", days:[1..7]}` (1 = lunedì) | `{kind:"weekly", times:1..7}`.
- Date sempre locali `YYYY-MM-DD`, mai UTC.
- `v = 0` rappresenta "non fatto" (non si cancellano chiavi: serve al merge).
- `t`/`updatedAt`: `Date.now()` all'ultima modifica.
- All'avvio: `navigator.storage.persist()`.

## 6. Regole di calcolo (`logic.js`, funzioni pure)

- **Prevista** il giorno `d`: abitudine non archiviata/eliminata, `d ≥ start`, e
  `daily` → sempre; `days` → giorno della settimana in `days`; `weekly` → mai (gestita a settimana).
- **Frazione** del giorno: `check` → `v ≥ 1 ? 1 : 0`; `quantity` → `min(v / target, 1)`.
- **Fatto** il giorno: frazione = 1.
- **Conteggio settimanale** (`weekly`): giorni "fatti" nella settimana lun–dom.
- **% giorno** (anello Oggi, heatmap globale): media delle frazioni delle abitudini previste quel giorno; nessuna prevista → giorno vuoto (non 0%).
- **% periodo** (andamento settimana/mese):
  `Σ raggiunto / Σ atteso`, considerando solo giorni ≤ oggi e ≥ `start`; abitudini giornaliere/giorni: atteso = giorni previsti nel periodo, raggiunto = Σ frazioni;
  settimanali: atteso = `times × (giorni attivi nel periodo / 7)`, raggiunto = `min(giorni fatti, atteso)`.
- **Streak giornaliera** (`daily`/`days`): a ritroso da oggi; si saltano i giorni non previsti; oggi non fatto viene saltato (non rompe); si contano i giorni previsti consecutivi fatti fino al primo non fatto o a `start`.
- **Streak settimanale** (`weekly`): settimana corrente contata se obiettivo raggiunto, altrimenti saltata; poi settimane precedenti consecutive con conteggio ≥ `times`.
- **Record**: massima serie sull'intero storico, stesse regole.

## 7. Backup e merge

- **Esporta**: file `habits-backup-AAAA-MM-GG.json` (documento completo). iPhone: `navigator.share({files})` → "Salva in File" (iCloud Drive). Fallback/PC: download `<a download>`. Aggiorna `settings.lastBackup`.
- **Importa**: `<input type="file" accept=".json">`. Validazione struttura (`version`, `habits` array, `entries` oggetto); se invalido → messaggio d'errore, nessuna modifica.
- **Merge** (vince il più recente):
  - abitudini per `id`, confronto `updatedAt`;
  - registrazioni per coppia (giorno, id), confronto `t`;
  - `settings` locali mantenute, `lastBackup` = max.
- Esito mostrato: "N abitudini, M registrazioni aggiornate".

## 8. Architettura file

```
index.html              shell + tab bar
style.css               stile, variabili colore, tema chiaro/scuro
manifest.webmanifest    nome, icone, display standalone
sw.js                   precache file, risposta dalla cache + aggiornamento in background, cache versionata
icons/                  icon.svg, icon-192.png, icon-512.png, apple-touch-icon.png (180)
js/app.js               avvio, router hash, tema, registrazione SW
js/store.js             load/save localStorage, CRUD abitudini, set registrazione, export/import
js/logic.js             date, prevista, frazione, streak, %, merge (puro, testato)
js/charts.js            SVG: anello, heatmap, linea, barre; tooltip al passaggio/tocco
js/ui.js                escape, formattazione date/numeri, palette colori
scripts/                make-icons.mjs (PNG senza dipendenze), serve.mjs (server locale)
js/views/today.js
js/views/habits.js
js/views/stats.js
js/views/settings.js
tests/logic.test.js     node --test
```

- `logic.js` non accede a DOM né a storage.
- `store.js` è l'unico modulo che scrive su `localStorage`; notifica le viste con un evento `change`.
- Viste: funzione `render(container, state)`; ricostruiscono il proprio contenuto a ogni `change`.

## 9. Errori

- `localStorage` non disponibile o pieno → banner d'errore persistente, l'app resta in sola lettura.
- JSON salvato corrotto → copia in `habits.v1.corrupt`, avvio con documento vuoto, avviso.
- Import invalido → messaggio, nessuna modifica.

## 10. Test e verifica

- `node --test tests/` su `logic.js`: frazioni, giorni previsti, streak (giornaliera, giorni specifici, settimanale, oggi non fatto, cambio anno), % periodo, merge.
- Verifica nel browser (viewport mobile, server locale): flussi crea abitudine → registra → statistiche; export/import; funzionamento offline con service worker.

## 11. Pubblicazione

Repository GitHub (account creato dall'utente) con GitHub Pages dalla branch `main`, root. Installazione: iPhone Safari → Condividi → Aggiungi a Home; PC Chrome/Edge → Installa app.
