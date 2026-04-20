---
applyTo: "**"
description: "Critical lessons learned during development. Consult to avoid repeating past bugs: SW skipWaiting, cache versioning, pause calculations, date UTC pitfalls, iOS caching, Git identity issues."
---

# Lezioni Apprese — Sviluppo Timbra PA

Questo documento raccoglie le lezioni apprese durante lo sviluppo agentico dell'app. L'agente deve consultarlo per evitare di ripetere errori già risolti.

## 1. Service Worker & Aggiornamenti PWA

### Problema: `skipWaiting()` nell'handler `install`
- **Causa**: Il SW si attivava immediatamente, servendo un mix di risorse vecchie (HTML) e nuove (JS), causando errori runtime.
- **Soluzione**: `skipWaiting()` va chiamato SOLO nell'handler `message`, quando l'utente clicca "Aggiorna ora". Il flusso corretto è: Install → Pre-cache → Waiting → Banner visibile → Utente conferma → `skipWaiting()` → Activate → `clients.claim()` → Reload controllato.
- **Regola**: MAI `skipWaiting()` nell'handler `install`.

### Problema: Cache stale dopo modifica file
- **Causa**: Il `CACHE_NAME` non veniva incrementato dopo le modifiche.
- **Soluzione**: Incrementare SEMPRE il numero in `CACHE_NAME` (es. `timbra-pa-v17` → `timbra-pa-v18`) quando si modifica qualsiasi file presente in `CACHE_URLS`.
- **Regola**: Ogni commit che tocca file cacheable DEVE bumbare il cache version.

### Problema: Stato misto tra HTML nuovo e JS vecchio
- **Causa**: Con strategia cache-first/stale-while-revalidate l'app shell poteva servire script vecchi dalla cache dopo un update.
- **Soluzione**: Usare `network-first` per HTML, JS, CSS e manifest; lasciare cache-first solo per asset statici secondari.
- **Regola**: Gli update della logica applicativa non devono mai dipendere da cache-first sugli asset core.

### Problema: Fallback offline rotto con percorso relativo
- **Causa**: Il fallback HTML usava `/index.html` (path assoluto) anziché il path relativo per GitHub Pages.
- **Soluzione**: Usare `BASE_PATH + 'index.html'` per il fallback, dove `BASE_PATH` è derivato dal path del SW stesso.

### Problema: Avvio lento offline con ES Modules
- **Causa**: I moduli ES sono caricati tramite import chain (app.js → AppController → services → adapters). Con strategia network-first, ogni livello del waterfall attendeva il timeout di rete (fino a 2.2s) prima di servire dalla cache. Con ~4 livelli, l'app impiegava fino a 8+ secondi per avviarsi offline.
- **Soluzione**: (1) `<link rel="modulepreload">` in `index.html` per tutti i moduli JS — elimina il waterfall, tutti i fetch partono in parallelo dal parsing dell'HTML. (2) `navigator.onLine` check nel SW `fetchNetworkFirst` — se il browser segnala offline, servi dalla cache senza provare la rete. (3) Timeout ridotti da 1.8s/2.2s a 1.2s/1.5s come protezione per i casi in cui `navigator.onLine` è inaffidabile (iOS).
- **Regola**: Ogni nuovo modulo JS aggiunto al progetto va anche aggiunto come `<link rel="modulepreload">` in `index.html` oltre che in `CACHE_URLS` del SW.

## 2. Dati Utente & Storage

### Problema: Confusione "backup automatico"
- **Causa**: L'app aveva un sistema di backup interno (snapshot IndexedDB + modale promemoria) che confondeva gli utenti. Pensavano che il backup fosse su cloud.
- **Soluzione**: Rimosso l'intero sistema di backup automatico. Tenuto solo "Esporta Backup JSON" — un file JSON scaricabile dall'utente, chiaro e trasparente.
- **Regola**: I dati sono SOLO sul dispositivo. Non creare sistemi che diano l'impressione di backup remoto.

### Problema: localStorage vs IndexedDB
- **Architettura**: localStorage è il primary storage (sincrono, sempre disponibile). IndexedDB è il fallback/replica. Al salvataggio si scrive su entrambi. Al caricamento si legge da localStorage; se vuoto, si prova IndexedDB.
- **Regola**: Non rompere mai il flusso `saveAllData` che scrive su entrambi gli storage.

### Problema: Quote localStorage
- **Limiti**: ~5MB su tutti i browser.  Un mese di dati ≈ 2KB. Attualmente non un problema, ma evitare di salvare strutture ridondanti.

## 3. Calcoli Orari & Pause

### Problema: Regola pausa pranzo aziendale diversa da quella inizialmente modellata
- **Causa**: La logica era stata semplificata troppo, deducendo 30 minuti anche quando la pausa reale era già stata registrata con multi-timbrature.
- **Soluzione**: Con coppia singola da lunedì a giovedì dedurre sempre 30 minuti se esiste lavoro registrato. Con multi-timbrature usare la pausa reale e dedurre solo l'eventuale differenza per arrivare a 30 minuti minimi. Il venerdì non applicare alcuna pausa automatica.
- **Regola**: Le multi-timbrature contano come pausa reale; non dedurre altri 30 minuti se il break totale è già almeno di 30 minuti. Il venerdì conta solo la pausa realmente registrata con uscita+rientro; nessuna deduzione automatica. `isFriday(parseDateISO(dateKey))` continua a distinguere target giornaliero e regola pausa del venerdì.

### Problema: Date UTC vs Local
- **Causa**: `new Date('2026-02-24')` crea una data UTC (mezzanotte UTC, che in IT è 23:00 del giorno prima in inverno).
- **Soluzione**: `parseDateISO()` usa `new Date(year, month-1, day)` che crea una data locale.
- **Regola**: MAI usare il costruttore `new Date(string)` per date ISO. SEMPRE `parseDateISO()`.

## 4. UI & iOS

### Problema: iPhone non aggiorna icona/nome PWA
- **Causa**: iOS cacha icona e nome al momento dell'installazione ("Add to Home Screen"). Non li aggiorna mai, nemmeno con SW update.
- **Soluzione**: Aggiunto `<meta name="apple-mobile-web-app-title" content="Timbra PA">` per le nuove installazioni. Per gli utenti esistenti: devono eliminare e reinstallare.
- **Regola**: Qualsiasi cambio a icone e nome va comunicato agli utenti iOS con istruzioni di reinstallazione.

### Problema: Inline styles nei componenti dinamici
- **Causa**: Componenti come il banner update usavano inline styles lunghissimi nell'innerHTML.
- **Soluzione**: Usare classi CSS definite in `css/style.css`. Il CSS è unico e centralizzato.
- **Regola**: MAI inline styles. Sempre classi CSS.

### Problema: Edit button troppo accessibile
- **Causa**: L'intero item entry era cliccabile per modificare, causando modifiche accidentali.
- **Soluzione**: Sostituito con un bottone esplicito "Correggi" piccolo, con toast educativo al primo tap sull'area non-bottone.
- **Regola**: Le azioni distruttive/modificanti richiedono UI esplicita e intenzionale.

## 5. Git & Deploy

### Problema: Push rifiutato
- **Causa**: Remote ha commit non presenti in local (es. modifica README su GitHub.com).
- **Soluzione**: `git pull --rebase origin main` poi `git push origin main`.
- **Regola**: SEMPRE tentare pull --rebase prima di push se fallisce.

### Problema: Commit firmati con account Git sbagliato
- **Causa**: `git config user.name` / `git config user.email` del repository puntavano a un account aziendale o secondario.
- **Soluzione**: Verificare sempre l'identità Git locale prima di committare. Se i commit sono già stati pubblicati, riscrivere autore e committer e pubblicare con `git push --force-with-lease`.
- **Regola**: Nei repository personali controllare sempre `git config --get user.name` e `git config --get user.email` prima di creare nuovi commit.

### Problema: Dimenticare di committare il service-worker
- **Causa**: Si modificano i file JS/CSS ma si dimentica di bumpare `CACHE_NAME`.
- **Soluzione**: Checklist mentale: "Ho toccato file dentro CACHE_URLS? → Bumpa CACHE_NAME".

## 6. Pattern Architetturali

### Singleton Services
Tutti i servizi (`timeCalculator`, `weekNavigator`, `eventBus`) sono singleton esportati. Non creare nuove istanze — importare sempre l'istanza esportata.

### EventBus per comunicazione
I componenti comunicano via `eventBus.emit(EVENTS.XXX, data)` e `eventBus.on(EVENTS.XXX, callback)`. Non creare dipendenze dirette tra views e models.

### Repository Pattern per storage
`StorageManager` è l'unico punto di accesso ai dati. Non chiamare direttamente `localStorage.setItem` o `indexedDB` — passare sempre da `StorageManager`.
