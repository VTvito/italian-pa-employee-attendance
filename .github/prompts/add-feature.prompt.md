---
name: 'Aggiungi Funzionalità'
description: 'Workflow guidato per aggiungere una nuova funzionalità: dalla pianificazione al commit, rispettando i pattern MVC+EventBus+Repository del progetto.'
---

# Aggiungi una Nuova Funzionalità — Timbra PA

Segui questo workflow per aggiungere una funzionalità in modo consistente con l'architettura esistente.

## Fase 1: Pianificazione

Rispondi a queste domande prima di scrivere codice:

1. **Quale layer è coinvolto?**
   - Calcolo/logica business → `js/services/TimeCalculator.js`
   - Navigazione settimane → `js/services/WeekNavigator.js`
   - Storage dati → `js/storage/StorageManager.js` (mai direttamente localStorage/IndexedDB)
   - Rendering UI → `js/views/UIManager.js`
   - Modali → `js/views/ModalManager.js`
   - Nuovo tipo di dato → `js/models/`

2. **Serve un nuovo evento EventBus?**
   - Controlla `js/utils/EventBus.js` per gli eventi esistenti (costanti `EVENTS`)
   - Se sì, aggiungi la costante prima di usarla

3. **La funzionalità serve offline?**
   - Se sì, il file JS va aggiunto a `CACHE_URLS` in `service-worker.js`
   - E come `<link rel="modulepreload">` in `index.html`

## Fase 2: Implementazione

### Ordine consigliato

```
1. Model (se serve un nuovo tipo di dato)
2. Service (logica di calcolo/business)
3. StorageManager (se cambiano i dati persistiti)
4. UIManager / ModalManager (rendering)
5. AppController (orchestrazione)
6. CSS (classi nuove in style.css, mai inline)
7. Test in test-suite.js
```

### Pattern da rispettare

**Singleton service** — non creare `new TimeCalculator()`, importare l'istanza:
```js
import { timeCalculator } from '../services/TimeCalculator.js';
```

**EventBus** — comunicazione tra layers:
```js
import { eventBus, EVENTS } from '../utils/EventBus.js';
eventBus.emit(EVENTS.WEEK_UPDATED, { weekKey });
eventBus.on(EVENTS.WEEK_UPDATED, ({ weekKey }) => { /* ... */ });
```

**Repository** — storage sempre tramite StorageManager:
```js
import { storageManager } from '../storage/StorageManager.js';
await storageManager.saveWeekData(weekKey, weekData);
```

**Date** — mai `new Date(str)`:
```js
import { parseDateISO, isFriday } from '../utils/DateUtils.js';
const date = parseDateISO('2026-04-20'); // ✅
const date = new Date('2026-04-20');     // ❌ UTC mismatch
```

**CSS** — mai inline styles:
```js
element.classList.add('my-new-class');  // ✅
element.style.color = 'red';           // ❌
```

## Fase 3: Validazione

```powershell
# 1. Errori statici
# usa get_errors su tutti i file modificati

# 2. Test manuali
# apri http://localhost:8080/tests/ → Esegui Tutti i Test
# risultato atteso: tutti passati, 0 falliti

# 3. Test visivo
# apri http://localhost:8080 e verifica la feature
```

Se hai aggiunto logica di calcolo, aggiungi almeno 2 test in `tests/test-suite.js`:
```js
await TestRunner.test('descrizione caso normale', () => { /* ... */ });
await TestRunner.test('descrizione caso limite', () => { /* ... */ });
```

## Fase 4: Release

Segui il prompt `release.prompt.md` per bump versione, CACHE_NAME e commit.

In particolare, se hai aggiunto un nuovo file JS:
- [ ] Aggiunto a `CACHE_URLS` in `service-worker.js`
- [ ] Aggiunto come `<link rel="modulepreload" href="..." as="script">` in `index.html`
- [ ] CACHE_NAME incrementato

## Checklist finale

- [ ] Zero errori statici (`get_errors`)
- [ ] Tutti i test passano
- [ ] Nessun inline style introdotto
- [ ] Nessuna dipendenza esterna aggiunta
- [ ] `parseDateISO` usato al posto di `new Date(str)`
- [ ] Nuovo file JS → modulepreload + CACHE_URLS
- [ ] CACHE_NAME e versione bumped
- [ ] Commit con messaggio descrittivo
