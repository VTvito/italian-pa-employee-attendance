---
applyTo: "js/**/*.js"
---

# Istruzioni JavaScript — Timbra PA

## Standard Codice

- ES6+ Vanilla JavaScript, ES Modules nativi (`import`/`export`)
- Nessun framework, nessun bundler, nessun transpiler
- `<script type="module">` nel HTML — il browser carica i moduli direttamente
- JSDoc su ogni classe e metodo pubblico
- Nomi variabili/funzioni in **inglese** (camelCase), classi in PascalCase, costanti in UPPER_SNAKE_CASE
- Commenti e stringhe UI in **italiano**

## Pattern Obbligatori

### Singleton
Ogni servizio esporta un'istanza singleton:
```js
export class TimeCalculator { /* ... */ }
export const timeCalculator = new TimeCalculator();
```
Importare sempre l'istanza, mai creare `new TimeCalculator()`.

### EventBus
Comunicazione tra componenti via `eventBus.emit(EVENTS.XXX, data)`. Gli eventi disponibili sono definiti come costanti in `js/utils/EventBus.js`.

### Repository
Lo storage passa SEMPRE da `StorageManager`. Mai chiamare `localStorage` o `indexedDB` direttamente nei controllers/views.

## Date & Orari

- Date: formato ISO `YYYY-MM-DD` (dateKey)
- Settimane: formato ISO `YYYY-Www` (weekKey, es. `2026-W09`)
- Orari: formato `HH:MM` (24h)
- Parsing date: SEMPRE `parseDateISO(str)` — MAI `new Date(str)`
- Verifica venerdì: `isFriday(parseDateISO(dateKey))`

## Logica Calcolo Ore

`TimeCalculator.calculateDayHours(entries, dateKey)` è il cuore del calcolo:
1. Entry speciali (smart/assente): converte `hours` in minuti
2. Entry normali: calcola coppie entrata/uscita, somma i minuti
3. Pausa (solo Lun–Gio):
   - 1 coppia + ore > 6h → deduce 30min automatici
   - 2+ coppie → calcola break reale → se < 30min, deduce la differenza
4. Venerdì: mai pausa

## Validazione Pre-Commit

Dopo ogni modifica a file JS:
1. `get_errors` su tutti i file modificati
2. Bracket matching (contare `{` vs `}` con script Python)
3. Se toccati file in `CACHE_URLS` del SW → incrementare `CACHE_NAME`
4. Aggiornare versione in `index.html` footer se rilascio visibile
