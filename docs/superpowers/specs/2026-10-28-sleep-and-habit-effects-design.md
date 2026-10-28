# Habits — Sonno, effetto delle abitudini, forme animate

Data: 2026-10-28 · Stato: approvato dall'utente

## Sonno
- Dati: `doc.sleep[giorno] = { q: 1..5 (0 = cancellato), h?: ore 0..24 a passi di 0,5, t }`.
  Il giorno è quello del **risveglio**: la registrazione descrive la notte precedente.
  Sezione separata da `journal`, così sonno e umore modificati su dispositivi diversi non si sovrascrivono.
- 5 livelli: Pessimo, Scarso, Discreto, Buono, Ottimo.
- Forma "Onde" (`js/sleep.js`, canvas): 5 anelli concentrici con increspature (ampiezza e velocità ∝ 1 − qualità),
  colori interpolati prugna/rosa (Pessimo) → blu/turchese (Ottimo), nucleo luminoso, respiro lento.
  Livello continuo 1..5, come l'Umore.
- Schermata `#sonno/<giorno>`: titolo "Sonno", sottotitolo "Notte tra … e …"; forma grande, cursore continuo
  (aggancio al livello al rilascio), scala Pessimo/Ottimo; card "Ore dormite" con − / + (0,5 h), vuota ("—")
  finché non la tocchi (primo tocco parte dall'ultimo valore registrato o 7,5), × per svuotarla; Salva / Elimina.
- Oggi: card Sonno e card Umore affiancate (due colonne), ciascuna con forma piccola animata + etichetta
  (es. "Buono · 7,5 h"); senza dati la forma è attenuata con "Com'è andata la notte?".

## Forme animate (Umore e Sonno)
- `drawMood(canvas, level, { faded, tm })` e `drawSleep(...)` accettano il tempo `tm`.
  Umore: respiro (scala ±4%), cristalli che ruotano piano con sfaccettature che brillano, increspature che
  scorrono verso l'esterno, petali che oscillano e pistilli che brillano. Sonno: onde e respiro.
- Un unico animatore (`animateShapes(root)`) disegna i canvas `[data-mood]` / `[data-sleep]` solo se visibili
  (IntersectionObserver), ~30 fps per le forme piccole, si ferma quando non ce ne sono a schermo.
  `prefers-reduced-motion`: forme ferme (tm = 0). Nelle schermate Umore/Sonno il livello segue il cursore e
  al rilascio scivola al livello intero (transizione già esistente), mentre l'animazione continua.

## Statistiche (seguono il periodo scelto)
- Card **Sonno**: puntini della qualità (colore del livello, scala 1–5) e sotto barre delle ore, allineati per
  giorno/settimana/mese come Umore; frase di sintesi "In media: Buono · 7,2 h (12 notti)". Senza dati: invito.
- Card **Sonno e abitudini**: come "Umore e abitudini", per ogni livello di sonno 1–5 la % di abitudini completate
  il giorno prima (puntino tenue per notte, media per livello); compare da 2 notti registrate.
- Card **Cosa ti fa stare meglio**: selettore Sonno · Ore · Umore. Per ogni abitudine, media con / senza:
  - Sonno e Ore: abitudine del giorno D → notte registrata il giorno D+1;
  - Umore: stesso giorno.
  "Con" = abitudine completata (frazione ≥ 1); "senza" = prevista ma non completata. Giorni saltati, in pausa
  o non previsti esclusi. Abitudine mostrata solo con ≥ 3 giorni in ciascun gruppo.
  Barre divergenti dal centro: verso destra "migliora" (turchese), verso sinistra "peggiora" (corallo),
  ordinate per effetto assoluto; valore "+0,8" / "+0,5 h" e tooltip "Dopo i giorni con Corsa: 4,1 (6 notti) ·
  senza: 3,3 (8 notti)". Nota fissa: "È una correlazione, non per forza una causa."
  Con pochi dati (tipico in Settimana): "Servono almeno 3 giorni con e 3 senza: prova Mese o 6 mesi."

## Sync / validazione
- `emptyDoc` e il caricamento aggiungono `sleep: {}`; `validateDoc` accetta `sleep` opzionale
  (`q` intero 0..5, `h` assente o 0..24). `mergeDocs` unisce `sleep` (vince `t` più recente) e ne restituisce il
  conteggio; `remoteIsBehind` e l'adozione del remoto lo considerano. Backup/import: incluso nel documento.

## Test
`sleepOf`, validazione e merge di `sleep`, statistiche per periodo con sonno, `habitEffects` (abbinamento notte
successiva, stesso giorno per l'umore, soglia 3+3, esclusione giorni saltati/in pausa).
