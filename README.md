# Habits

Tracker di abitudini personale, offline, per iPhone e PC. Nessun account: i dati restano sul dispositivo.

- **Oggi**: segna le abitudini (sì/no o quantità con obiettivo e passo dei pulsanti), naviga tra i giorni,
  ⏭ salta un giorno senza perdere la serie, registra l'**Umore** (7 livelli con forma animata, emozioni, fattori, nota) e il **Sonno** della notte
  (5 livelli con onde animate, ore dormite facoltative); in Statistiche "Cosa ti fa stare meglio" mostra quali
  abitudini vanno insieme a un sonno o un umore migliore.
- **Pausa e vacanza**: metti in pausa un'abitudine o tutte (Impostazioni → Vacanza) per un periodo; non contano e non interrompono le serie.
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

## 3. Sincronizzazione automatica (facoltativa)

I dati vengono cifrati sul dispositivo (AES-256, chiave ricavata dalla tua password) e salvati in un Gist segreto
sul tuo account GitHub: GitHub vede solo testo illeggibile.

1. Crea un token: <https://github.com/settings/tokens/new?scopes=gist&description=Habits%20sync>
   → lascia spuntato solo **gist** → scegli la scadenza → **Generate token** → copia il codice `ghp_…`.
2. Nell'app: **Impostazioni → Sincronizzazione** → incolla il token, scegli una password (≥ 8 caratteri) → **Collega**.
3. Ripeti sull'altro dispositivo con **lo stesso token e la stessa password**: i dati vengono uniti.

Sincronizza all'apertura, al ritorno della rete e qualche secondo dopo ogni modifica.
Se il token scade, l'app continua a funzionare offline e mostra un avviso: crea un nuovo token, **Scollega** e **Collega**.
Se dimentichi la password la copia sul Gist non è recuperabile (i dati sui dispositivi restano).

## 4. Backup e passaggio manuale iPhone ↔ PC

- **Esporta backup** (Impostazioni): su iPhone scegli "Salva in File" → iCloud Drive; su PC salva nella cartella OneDrive.
- **Importa backup** sull'altro dispositivo: i dati vengono **uniti**, per ogni giorno e abitudine vince la modifica più recente.
- L'app ricorda di fare un backup se l'ultimo ha più di 7 giorni.
- ⚠️ Se elimini l'icona dalla Home su iPhone, iOS cancella anche i dati: esporta prima un backup.

## 5. Aggiornamenti

Dopo un `git push` la pagina arriva sempre dalla rete quando sei online, gli altri file si aggiornano in background:
chiudi e riapri l'app un paio di volte (GitHub Pages può impiegare fino a 10 minuti).
Se aggiungi nuovi file all'app, elencali in `FILES` dentro `sw.js` e incrementa `CACHE` (es. `habits-v4`).

**Nuova icona:** i dispositivi la memorizzano per nome file, quindi un nuovo disegno va generato con un nome nuovo
(`scripts/make-icons.mjs`, poi `index.html`, `manifest.webmanifest`, `sw.js`). Sull'iPhone l'icona si aggiorna solo
eliminandola dalla Home e aggiungendola di nuovo da Safari; su PC disinstallando e reinstallando l'app.
Prima collega la sincronizzazione (o esporta un backup).

## 6. Costi e limiti

- **Costi:** nessuno. GitHub Pages e Gist sono gratuiti; l'app non usa server né servizi a pagamento.
- **Token GitHub:** è una chiave d'accesso, non un credito che si consuma. Il limite è 5.000 richieste/ora; l'app ne usa 2–3 per sincronizzazione.
- **Dati:** stanno sui dispositivi. Eliminare l'app o i dati del browser li cancella, salvo sincronizzazione o backup.
- **Niente promemoria/notifiche** (non disponibili offline su iPhone).
- **Dipendenza da GitHub:** se un giorno cambiasse le condizioni gratuite, l'app installata continua a funzionare offline
  e i file si possono pubblicare altrove (Netlify, Cloudflare Pages): sono file statici.

## 7. Sviluppo

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
