---
applyTo: "service-worker.js,js/app.js,manifest.json"
---

# Istruzioni PWA — Timbra PA

## Service Worker

Il file `service-worker.js` gestisce SOLO il caching delle risorse statiche. Non tocca mai i dati utente (localStorage/IndexedDB).

### Strategia Caching
- **Cache-first + Stale-while-revalidate**: serve dalla cache, aggiorna in background
- `CACHE_NAME` deve essere incrementato ad ogni modifica di file cached
- Prefisso cache attuale: `timbra-pa-vNN`

### Flusso Aggiornamento (CRITICO)
```
Install (pre-cache) → Waiting → Banner "Aggiorna ora" → 
Utente conferma → skipWaiting → Activate (pulisce vecchie cache) → 
clients.claim() → Notifica SW_ACTIVATED → Reload
```

**Regola fondamentale**: `skipWaiting()` è chiamato SOLO nel handler `message`, MAI in `install`.

### Modifica Cache URLs
Se aggiungi un nuovo file che deve funzionare offline, aggiungi il path a `CACHE_URLS` nel service-worker.js.

## Manifest

- `manifest.json` nella root
- Display: standalone (fullscreen senza barra URL)
- Shortcuts: entrata/uscita via `?action=entrata` e `?action=uscita`
- Icone SVG con gradient (192px e 512px)

## iOS PWA Specifiche

- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-title" content="Timbra PA">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- iOS NON supporta `beforeinstallprompt` → mostrare istruzioni manuali
- iOS cacha icona/nome al primo install → cambio richiede reinstallazione

## Dati Utente & Aggiornamenti

I dati utente (localStorage key `workTimeData`, IndexedDB `OrariLavoroDB`) **sopravvivono** a qualsiasi aggiornamento del Service Worker. Il SW gestisce solo la cache HTTP.

Prima del reload post-aggiornamento, `app.js` verifica l'integrità dei dati con `verifyDataIntegrity()` (legge e parsa localStorage).
