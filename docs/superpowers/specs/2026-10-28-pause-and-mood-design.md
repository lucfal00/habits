# Habits — Pausa/Vacanza e Umore

Data: 2026-10-28 · Stato: approvato dall'utente

## Pausa / Vacanza
- **Salta oggi**: registrazione `{ v: 0, s: 1, t }` per (giorno, abitudine). Pulsante ⏭ sulla scheda in Oggi; la scheda saltata è attenuata con "Ripristina".
- **Pausa di un'abitudine**: `habit.pauses = [{ from, to, vac? }]` (date incluse), gestita in Modifica abitudine.
- **Vacanza**: in Impostazioni; aggiunge `{ from, to, vac: true }` a tutte le abitudini attive. "Termina ora" accorcia a ieri (o rimuove se non ancora iniziata) le pause `vac` che coprono oggi. Banner in Oggi durante la vacanza.
- **Regole**: un giorno in pausa non è "previsto"; un giorno saltato non è "dovuto". Entrambi non toccano %, serie, calendario.
  Settimanali: giorni attivi = giorni non in pausa/saltati; obiettivo della settimana = `ceil(times × attivi / 7)`; settimana senza giorni attivi ignorata per la serie.

## Umore
- Dati: `doc.journal[giorno] = { mood: 1..7 (0 = cancellato), feelings: string[], factors: string[], note, t }`; merge per giorno, vince `t` più recente.
- 7 livelli: Molto spiacevole … Neutro … Molto piacevole. Forma: funzione radiale con 8 lobi; ampiezza, nitidezza, colori e dettagli (sfaccettature, increspature, doppi petali + venature + pistillo, nucleo, aura) interpolati in modo continuo sul livello (`js/mood.js`, canvas).
- Schermata `#umore/<giorno>`: forma grande + cursore continuo (aggancio al livello al rilascio), emozioni suggerite per fascia (sostantivi, nessun genere), fattori, nota, Salva / Elimina.
- Oggi: scheda Umore (forma piccola + etichetta) → apre la schermata. Statistiche: striscia ultimi 30 giorni, % completamento medio per fascia (spiacevole 1–3, neutro 4, piacevole 5–7), emozioni e fattori più frequenti.

## Sync / validazione
`validateDoc` accetta `journal` e `pauses` opzionali; `mergeDocs` unisce anche `journal` e ne restituisce il conteggio.
