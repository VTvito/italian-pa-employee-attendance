# Timbra PA — Agent Instructions

PWA offline-first per dipendenti pubblici italiani. Zero back-end, Vanilla JS ES Modules, localStorage + IndexedDB.

**Istruzioni complete**: `.github/copilot-instructions.md`

## TL;DR per agenti AI

- **Nessun bundler, nessun npm**: l'app è JS vanilla puro, servibile con `python -m http.server 8080`
- **Validare prima di committare**: `get_errors` su tutti i file JS/CSS modificati
- **Ogni modifica a file cacheable** → incrementare `CACHE_NAME` in `service-worker.js` e versione in `index.html`
- **Date**: sempre `parseDateISO(str)`, mai `new Date(str)` (UTC mismatch)
- **Venerdì**: nessuna pausa automatica; solo pausa reale da uscita+rientro
- **Git identity**: verificare `git config --get user.name` e `git config --get user.email` prima di ogni commit

## File chiave

| File | Ruolo |
|---|---|
| `js/services/TimeCalculator.js` | Calcoli ore, pause, delta, pace delta |
| `js/views/UIManager.js` | Rendering UI + summary panel |
| `service-worker.js` | Caching network-first, update flow |
| `js/utils/DateUtils.js` | ISO 8601, `parseDateISO`, `isFriday` |
| `js/utils/Validators.js` | `parseTimeToMinutes`, `minutesToTime` |

## Regole business

- 36h/settimana: Lun–Gio 7h30m + Venerdì 6h
- Pausa automatica 30min solo Lun–Gio (coppia singola); multi-coppie → pausa reale
- Summary panel: "Da completare" / "Obiettivo ✅ Raggiunto" / "Ore extra" + "Sul ritmo" (pace delta)

> Trust these instructions. Only explore the codebase if information here is incomplete or incorrect.
