# Habits — Promemoria (notifiche push)

Data: 2026-10-28 · Stato: approvato dall'utente

## Obiettivo
Notifiche di Habits su iPhone (web app nella schermata Home, iOS ≥ 16.4) e PC (Edge), configurate **solo dentro
Habits**. Tipi: per abitudine (solo se non ancora fatta), Sonno al mattino, Umore la sera, riepilogo settimanale.

## Cosa fa l'utente (una volta sola)
1. Crea un account gratuito su Cloudflare.
2. Nella scheda del terminale: `npm run notifiche` → si apre il browser, clic su "Allow"; lo script fa il resto
   (archivio, chiavi, pubblicazione) e scrive `js/push-config.js`.
3. `git push` (commit preparato da Claude).
4. Su ogni dispositivo: Impostazioni → Notifiche → "Attiva su questo dispositivo" → consenti.

## Impostazioni in Habits
- Modifica abitudine: campo facoltativo **Promemoria** (ora). Vuoto = nessun promemoria.
- Impostazioni → **Notifiche**: interruttore del dispositivo; Sonno (ora, predefinito 9:00, disattivabile);
  Umore (21:30); Riepilogo settimanale (domenica 20:00, sì/no).
- Orari e scelte sono sincronizzati tra dispositivi: `habit.remind = "HH:MM"`,
  `doc.reminders = { sleep: "HH:MM" | null, mood: "HH:MM" | null, weekly: bool, t }` (merge: vince `t` più recente).
  L'attivazione e l'iscrizione push sono per dispositivo (localStorage `habits.push`).
- La sezione Notifiche compare solo se il servizio è configurato (`js/push-config.js`); su iPhone fuori dalla
  schermata Home spiega di aggiungere l'app alla Home.

## Quando arriva una notifica
- **Abitudine**: all'ora scelta, nei giorni in cui è prevista (non in pausa), se oggi non è fatta né saltata.
  Settimanali: ogni giorno finché l'obiettivo della settimana non è raggiunto e oggi non è fatta.
- **Sonno**: se oggi la notte non è registrata. **Umore**: se oggi l'umore non è registrato.
- **Riepilogo**: domenica all'ora fissata, sempre.
- Testo composto sul dispositivo (il service worker legge una copia locale con nomi e riepilogo della settimana):
  "📚 Leggere · non ancora fatta oggi", "Com'è andata la notte?", "Com'è andata la giornata?",
  "Settimana: 82% · serie migliore 🔥 12". Tocco → `#oggi`, `#sonno/<oggi>`, `#umore/<oggi>`, `#stats`.
  Se il dispositivo non conosce ancora l'abitudine (creata altrove, app non aperta): testo generico.

## Servizio (Cloudflare Worker + KV, piano gratuito)
- Stato in KV: iscrizioni push (max 6, le più vecchie escono), fuso orario, piano
  `[{ id, kind: habit|sleep|mood|weekly, time, days?, pauses?, weekly? }]`, stato di oggi
  `{ date, done: [id], weekDone: { week, ids }, sleep: bool, mood: bool }`, inviati di oggi.
- L'app manda piano e stato a ogni salvataggio (raggruppati, ~5 s) da qualsiasi dispositivo online.
- Cron ogni 5 minuti: per i promemoria con ora nella finestra degli ultimi 15 minuti non ancora inviati oggi e
  non soddisfatti → push cifrata (RFC 8291, VAPID) con contenuto minimo `{ kind, id }`. Iscrizioni scadute
  (404/410) rimosse.
- Autenticazione: ogni chiamata porta il token GitHub già usato per la sincronizzazione; il servizio lo verifica
  con GitHub (`/user` = proprietario configurato), tiene in cache solo un'impronta (SHA-256). Senza sincronizzazione
  collegata le notifiche non si attivano.
- Privacy: il servizio conosce orari, identificativi anonimi delle abitudini e fatto/non fatto di oggi; mai nomi,
  umore, sonno, note.

## Limiti
- Se spunti offline, il servizio lo sa solo quando torni online: può arrivare un promemoria per una cosa fatta.
- Le notifiche dipendono dai server push di Apple/Microsoft (ritardi di qualche minuto possibili).

## Test
Logica dei promemoria in `js/remind.js` (pura, condivisa da app e servizio): cosa è dovuto a un certo orario dato
piano + stato; finestra e duplicati; settimanali e pause; fuso orario/ora legale. Cifratura push: andata e ritorno
con una decifratura di prova in Node. Validazione e merge di `habit.remind` e `doc.reminders`.
