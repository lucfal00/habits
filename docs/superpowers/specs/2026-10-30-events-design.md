# Eventi — design

Approved in chat on 2026-10-30 (mockup v2, without the pleasant / unpleasant type).

## Goal
Record sporadic things (tea, friends, a medical visit, bad news) and see whether they go with better or worse
mood and sleep. Whether an event is good or bad is decided by the data, never by a label.

## Data
- `doc.events = [{ id, name, icon, since, order, archived, deleted, updatedAt }]` — merged like habits
  (per id, newest `updatedAt` wins). `since` = creation day; earlier days are not counted as "without".
- `doc.happened[day][eventId] = { on: 0 | 1, t }` — merged per (day, event), newest `t` wins (0 = tombstone).
- Both optional in `validateDoc`; `mergeDocs` returns an `events` count, used wherever the other counts are summed.

## Oggi
- A card the size of a habit, above the habits: icon, "Eventi", today's events by name, chevron.
- Tap → it expands into chips (one per active event, accent fill when it happened) plus "+ Nuovo".
- Hidden on future days.

## Abitudini
- Below the habits: list "Eventi" with "+ Nuovo evento"; form with Nome, Icona (optional), Archivia / Elimina.
- Habits and events: the field is called "Icona", typed from the keyboard; no preset row. Empty = no icon.

## Statistiche
- "Cosa ti fa stare meglio" becomes "Da cosa dipendono umore e sonno": habits and events together, switch
  Umore / Sonno / Ore (Umore first). Mood = same day; sleep = the night after.
- Event: days it happened vs days since `since` without it, among days with the outcome recorded; min 3 + 3.
- Bars below 15 % of the scale span are gray ("differenza piccola").
- Mood card, week and month: a strip of dots under the mood chart marking days with events (tooltip lists them).
