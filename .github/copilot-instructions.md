# Timbra PA — Copilot Instructions

## Repository Summary

PWA (Progressive Web App) per dipendenti pubblici italiani. Traccia timbrature entrata/uscita, calcola automaticamente le 36 ore settimanali e funziona offline. **Zero back-end**: tutti i dati risiedono in localStorage (primary) e IndexedDB (fallback) sul dispositivo dell'utente.

Hosting: **GitHub Pages** — `https://vtvito.github.io/italian-pa-employee-attendance/`

## Tech Stack

| Layer | Tecnologia |
|---|---|
| Linguaggio | Vanilla JavaScript ES6+ (no framework, no bundler) |
| Moduli | ES Modules nativi (`<script type="module">`) |
| Stile | Single CSS file, variabili CSS custom, iOS-inspired design |
| Storage | localStorage (`workTimeData` key) + IndexedDB (`OrariLavoroDB`) |
| Offline | Service Worker con app shell network-first e asset secondari cache-first |
| Manifesto | `manifest.json` — standalone PWA |
| Icone | SVG con linear gradient |
| Test | `tests/test-suite.js` (test manuali, no runner) |
| CI/CD | Nessuno — push diretto su `main`, GitHub Pages autodeploy |

**Non disponibile in questo ambiente**: Node.js, npm, yarn, bundlers. Non eseguire `node`, `npm`, `npx`.

## Architecture

Pattern: **MVC + Observer (EventBus) + Repository**

```
js/
  app.js                      → Bootstrap, SW registration, update flow
  controllers/
    AppController.js           → Controller MVC principale, orchestrazione
  models/
    TimeEntry.js               → Model singola timbratura (entrata/uscita/smart/assente)
    WeekData.js                → Model dati settimana (Map<dateKey, TimeEntry[]>)
  services/
    TimeCalculator.js          → Calcoli ore, pause, delta, suggerimento uscita venerdì
    WeekNavigator.js           → Navigazione settimane ISO 8601
    ExportService.js           → Export JSON/CSV, import
  storage/
    StorageManager.js          → Repository pattern, dual storage con fallback
    LocalStorageAdapter.js     → Adapter localStorage
    IndexedDBAdapter.js        → Adapter IndexedDB
  views/
    UIManager.js               → Rendering UI, toast, PWA install, week period, Friday hint
    ModalManager.js            → Gestione modale (edit, add, confirm, clean)
  utils/
    EventBus.js                → Pub/Sub con eventi tipizzati (EVENTS const)
    DateUtils.js               → ISO 8601 weeks, formatting, parsing
    Validators.js              → Validazione orari, entry, sanitizzazione
```

## Business Rules (CCNL Funzioni Locali)

- Settimana lavorativa: **36 ore** (Lun–Ven)
- Target giornaliero Lun–Gio: **7h 30m** — Venerdì: **6h**
- Pausa pranzo automatica:
  - Lun–Gio: **30 minuti fissi** con coppia singola; con multi-timbrature vale la pausa reale e si integra solo l'eventuale differenza fino a 30 minuti
  - Venerdì: **0 minuti fino a 6h lorde**, oltre 6h stessa logica della pausa minima di 30 minuti
  - Le multi-timbrature evitano deduzioni doppie se il break reale è già sufficiente
- Smart Working / Assente: sostituiscono l'intera giornata con ore fisse
- Venerdì: l'app suggerisce l'ora di uscita anticipata calcolando gli extra Lun–Gio

## Build & Validate

Non c'è una build step. L'app è vanilla JS servibile direttamente.

### Avvio locale (test)
```powershell
cd d:\Documents\Proj_code\timbrature-pa
python -m http.server 8080
# Apri http://localhost:8080
```

### Validazione prima di commit
1. **Errori statici**: usare `get_errors` su tutti i file JS e CSS
2. **Bracket matching**: `python -c` script per contare `{` vs `}` nei file JS
3. **Verifica logica**: test Python che simula scenari di calcolo
4. **Service Worker**: dopo ogni modifica ai file cached, **incrementare `CACHE_NAME`** in `service-worker.js`
5. **Versione footer**: aggiornare `appVersion` in `index.html` per ogni rilascio

### Deploy
```powershell
git add -A; git status
git commit -m "Descrizione concisa"
git push origin main
# Se push rifiutato: git pull --rebase origin main, poi push
```

## Key Conventions

- Lingua UI e commenti: **italiano**
- Commenti JSDoc su ogni classe e metodo pubblico
- Nomi variabili e funzioni: **inglese** (camelCase)
- Nomi classi: **PascalCase**
- Costanti: **UPPER_SNAKE_CASE**
- Ogni servizio esporta un **singleton** (`export const timeCalculator = new TimeCalculator()`)
- I dati sono sempre serializzati come `{weekKey: {dateKey: [{type, time?, hours?}]}}` 
- Si salvano solo le entry raw; totali, saldi e pause vengono sempre ricalcolati a runtime
- Le date usano ISO 8601: `YYYY-MM-DD` (dateKey), `YYYY-Www` (weekKey)
- Gli orari sono `HH:MM` (24h)
- **Mai usare inline styles** per nuovi componenti — usare classi CSS in `css/style.css`
- **Mai aggiungere dipendenze esterne** — resta zero-dependency

## Common Pitfalls (Trust These First)

1. **Cache SW**: ogni volta che modifichi file in `CACHE_URLS`, incrementa il numero in `CACHE_NAME` o l'utente non vedrà le modifiche
2. **skipWaiting**: NON va nel handler `install` — solo nel handler `message` su richiesta utente
3. **iOS PWA**: l'icona e il nome vengono cachati all'installazione. Per aggiornarli l'utente deve rimuovere e reinstallare l'app
4. **localStorage quota**: ~5MB. Comprimere dati se si cresce. Attualmente ~2KB per mese
5. **Calcoli pause**: con coppia singola Lun–Gio la pausa è sempre 30min; con multi-timbrature deduci solo l'eventuale quota mancante ai 30min. Venerdì stessa logica ma solo sopra 6h lorde
6. **Update PWA**: HTML, JS, CSS e manifest devono preferire la rete per evitare mix tra codice nuovo e vecchio; il SW non deve mai toccare localStorage o IndexedDB
7. **parseDateISO**: usa `new Date(year, month-1, day)` (locale), non `new Date(str)` (UTC mismatch)
8. **git push fallisce**: fare sempre `git pull --rebase origin main` e riprovare
