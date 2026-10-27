# Habits

Tracker di abitudini personale, offline, per iPhone e PC. Nessun account: i dati restano sul dispositivo.

- **Oggi**: segna le abitudini (sì/no o quantità con obiettivo), naviga tra i giorni.
- **Abitudini**: crea, modifica, riordina, archivia. Frequenza: ogni giorno, giorni specifici, N volte a settimana.
- **Statistiche**: andamento % per settimane/mesi, calendario annuale, serie attuale e record, grafico valori/obiettivo.
- **Impostazioni**: tema, esporta/importa backup.

## 1. Pubblicazione su GitHub Pages (una volta sola)

1. Crea un account gratuito su <https://github.com>.
2. Crea un nuovo repository **pubblico** chiamato `habits` (senza README).
   Il codice sarà visibile, i tuoi dati no: restano sul dispositivo.
3. Da questa cartella:
   ```bash
   git remote add origin https://github.com/<tuo-utente>/habits.git
   git push -u origin main
   ```
   Al primo push Windows apre il login GitHub nel browser.
4. Su GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
5. Dopo 1–2 minuti l'app è su `https://<tuo-utente>.github.io/habits/`.

## 2. Installazione

- **iPhone**: apri l'indirizzo in **Safari** → pulsante Condividi → **Aggiungi alla schermata Home**.
  Apri sempre l'app dall'icona sulla Home (ha uno spazio dati suo, separato da Safari).
- **PC**: apri l'indirizzo in **Chrome** o **Edge** → icona "Installa" nella barra degli indirizzi.

Dopo la prima apertura funziona anche senza internet.

## 3. Backup e passaggio iPhone ↔ PC

- **Esporta backup** (Impostazioni): su iPhone scegli "Salva in File" → iCloud Drive; su PC salva nella cartella OneDrive.
- **Importa backup** sull'altro dispositivo: i dati vengono **uniti**, per ogni giorno e abitudine vince la modifica più recente.
- L'app ricorda di fare un backup se l'ultimo ha più di 7 giorni.
- ⚠️ Se elimini l'icona dalla Home su iPhone, iOS cancella anche i dati: esporta prima un backup.

## 4. Aggiornamenti

Dopo un `git push` di nuove modifiche, l'app scarica la nuova versione in background:
è visibile dalla **seconda** apertura successiva.
Se aggiungi nuovi file all'app, elencali in `FILES` dentro `sw.js` e incrementa `CACHE` (es. `habits-v2`).

## 5. Sviluppo

Serve solo Node.js (nessuna dipendenza da installare).

```bash
npm test
```

```bash
npm run serve
```

Il secondo comando avvia un server locale su <http://localhost:8080>. `npm run icons` rigenera le icone PNG.

Struttura: `js/logic.js` (calcoli puri, testati), `js/store.js` (salvataggio e backup), `js/charts.js` (grafici SVG),
`js/views/` (una schermata per file), `sw.js` (offline). Specifica: `docs/superpowers/specs/`.
