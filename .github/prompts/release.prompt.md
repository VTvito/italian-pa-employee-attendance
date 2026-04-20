---
name: 'Release Checklist'
description: 'Checklist completa per rilasciare una nuova versione: bump versione, CACHE_NAME, commit e push.'
---

# Checklist Release — Timbra PA

Esegui questi passi nell'ordine indicato ogni volta che fai un rilascio visibile all'utente.

## 1. Verifica identità Git

```powershell
git config --get user.name   # deve essere: VTvito
git config --get user.email  # deve essere: vito.delia97@gmail.com
```

Se non corretti: `git config user.name "VTvito"` e `git config user.email "vito.delia97@gmail.com"`

## 2. Determina la nuova versione

Segui Semantic Versioning:
- **Patch** `x.x.N` → bugfix, correzioni minori, CSS tweaks
- **Minor** `x.N.0` → nuova funzionalità visibile all'utente
- **Major** `N.0.0` → cambiamenti architetturali significativi

Versione corrente: controlla `id="appVersion"` in `index.html`.

## 3. Bumpa CACHE_NAME in `service-worker.js`

```js
// Prima
const CACHE_NAME = 'timbra-pa-vNN';
const APP_VERSION = 'x.y.z';

// Dopo (incrementa sempre il numero, anche per patch)
const CACHE_NAME = 'timbra-pa-v(NN+1)';
const APP_VERSION = 'x.y.(z+1)';
```

⚠️ **Regola assoluta**: se hai modificato qualsiasi file presente in `CACHE_URLS`, il numero DEVE essere incrementato. Se dimentichi, gli utenti non vedranno le modifiche.

## 4. Aggiorna versione nel footer di `index.html`

```html
<!-- Trova e aggiorna questo span -->
<span class="app-version" id="appVersion">vX.Y.Z • Dati salvati solo sul tuo dispositivo 🔒</span>
```

## 5. Verifica errori statici

Esegui `get_errors` su tutti i file modificati:
- `js/services/TimeCalculator.js`
- `js/views/UIManager.js`
- `css/style.css`
- `index.html`
- `service-worker.js`
- (altri file modificati nel rilascio)

Zero errori prima di procedere.

## 6. Verifica test

Apri `http://localhost:8080/tests/` e clicca "▶ Esegui Tutti i Test".
Risultato atteso: **61 passed, 0 failed** (o più se hai aggiunto test).

## 7. Verifica visiva in browser

Apri `http://localhost:8080` e controlla:
- [ ] Footer mostra la nuova versione
- [ ] Summary panel funziona (Da completare / Sul ritmo)
- [ ] Nessun errore in console

## 8. Commit e push

```powershell
git add -A
git status   # verifica i file inclusi
git commit -m "tipo(scope): descrizione concisa

- Dettaglio modifica 1
- Dettaglio modifica 2
- CACHE_NAME vNN→v(NN+1), versione x.y.z→x.y.(z+1)"

git push origin main
# Se fallisce: git pull --rebase origin main, poi ripush
```

### Convenzione commit message

```
feat: nuova funzionalità
fix: correzione bug
ux: miglioramento interfaccia
perf: ottimizzazione performance
docs: solo documentazione
refactor: refactoring senza cambio comportamento
```

## 9. Verifica GitHub Pages

Dopo ~60 secondi dal push, apri `https://vtvito.github.io/italian-pa-employee-attendance/` e verifica che la nuova versione sia visibile nel footer.
