/**
 * Service Worker - Caching e Offline Support
 * 
 * @description Gestisce il caching delle risorse per funzionamento offline
 * e aggiornamenti dell'applicazione.
 * 
 * STRATEGIA AGGIORNAMENTO:
 * 1. Install: pre-cache nuove risorse, ma NON skipWaiting (aspetta ok utente)
 * 2. L'app rileva il nuovo SW in waiting e mostra banner "Aggiorna"
 * 3. L'utente clicca "Aggiorna" → postMessage({action:'skipWaiting'})
 * 4. Il SW chiama skipWaiting(), diventa attivo e cancella le vecchie cache
 * 5. L'app rileva controllerchange e fa reload DOPO aver verificato i dati
 * 
 * DATI UTENTE:
 * I dati (localStorage/IndexedDB) NON sono toccati dal Service Worker.
 * Il SW gestisce solo la cache HTTP delle risorse statiche.
 */

// IMPORTANTE: Incrementa questo numero per forzare l'aggiornamento dell'app
const CACHE_NAME = 'timbra-pa-v17';

// Versione leggibile per logging
const APP_VERSION = '2.1';

// Determina il base path per GitHub Pages o localhost
const BASE_PATH = self.location.pathname.replace('service-worker.js', '');

const CACHE_URLS = [
    BASE_PATH,
    BASE_PATH + 'index.html',
    BASE_PATH + 'css/style.css',
    BASE_PATH + 'js/app.js',
    BASE_PATH + 'js/controllers/AppController.js',
    BASE_PATH + 'js/models/TimeEntry.js',
    BASE_PATH + 'js/models/WeekData.js',
    BASE_PATH + 'js/services/TimeCalculator.js',
    BASE_PATH + 'js/services/WeekNavigator.js',
    BASE_PATH + 'js/services/ExportService.js',
    BASE_PATH + 'js/storage/StorageManager.js',
    BASE_PATH + 'js/storage/LocalStorageAdapter.js',
    BASE_PATH + 'js/storage/IndexedDBAdapter.js',
    BASE_PATH + 'js/views/UIManager.js',
    BASE_PATH + 'js/views/ModalManager.js',
    BASE_PATH + 'js/utils/EventBus.js',
    BASE_PATH + 'js/utils/DateUtils.js',
    BASE_PATH + 'js/utils/Validators.js',
    BASE_PATH + 'manifest.json',
    BASE_PATH + 'icons/icon-192.svg',
    BASE_PATH + 'icons/icon-512.svg'
];

/**
 * Evento Install - Cache delle risorse statiche
 * 
 * NON chiama skipWaiting(): il nuovo SW resta in stato "waiting"
 * finché l'utente non conferma l'aggiornamento tramite il banner UI.
 * Questo garantisce che la pagina corrente non venga mai servita
 * con un mix di risorse vecchie e nuove.
 */
self.addEventListener('install', (event) => {
    console.log(`[SW] Install v${APP_VERSION} (${CACHE_NAME})`);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching risorse...');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => {
                console.log('[SW] Pre-cache completato. In attesa di attivazione utente.');
                // ⚠️ NON chiamo skipWaiting() qui.
                // Il SW resta in "waiting" fino a postMessage({action:'skipWaiting'})
            })
            .catch((error) => {
                console.error('[SW] Pre-cache fallito:', error);
            })
    );
});

/**
 * Evento Activate - Pulizia vecchie cache
 * 
 * Viene eseguito SOLO dopo che il SW "waiting" è stato promosso:
 * - Al primo caricamento (se non c'era un SW precedente)
 * - Dopo che l'utente clicca "Aggiorna" (skipWaiting → activate)
 */
self.addEventListener('activate', (event) => {
    console.log(`[SW] Activate v${APP_VERSION}`);
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Eliminazione cache obsoleta:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                return self.clients.claim();
            })
            .then(() => {
                // Notifica tutte le pagine che l'aggiornamento è completo
                return self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'SW_ACTIVATED',
                            version: APP_VERSION,
                            cache: CACHE_NAME
                        });
                    });
                });
            })
    );
});

/**
 * Evento Fetch - Strategia Cache-First con Stale-While-Revalidate
 * 
 * 1. Cerca in cache → ritorna se trovato
 * 2. In background, aggiorna la cache dalla rete
 * 3. Se non in cache → fetch dalla rete e cachea
 */
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    fetchAndCache(event.request);
                    return cachedResponse;
                }
                return fetchAndCache(event.request);
            })
            .catch(() => {
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return caches.match(BASE_PATH + 'index.html');
                }
            })
    );
});

/**
 * Fetch e aggiorna cache
 * @param {Request} request 
 * @returns {Promise<Response>}
 */
async function fetchAndCache(request) {
    try {
        const response = await fetch(request);
        
        // Salva in cache solo risposte valide
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        // Se fallisce, prova a ritornare dalla cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

/**
 * Evento Message - Gestione messaggi dal main thread
 * 
 * Messaggi supportati:
 * - {action: 'skipWaiting'}  → Attiva il SW in waiting (trigger aggiornamento)
 * - {action: 'getVersion'}   → Ritorna la versione corrente del SW
 */
self.addEventListener('message', (event) => {
    if (event.data?.action === 'skipWaiting') {
        console.log('[SW] skipWaiting richiesto dall\'utente');
        self.skipWaiting();
    }
    
    if (event.data?.action === 'getVersion') {
        event.source?.postMessage({
            type: 'SW_VERSION',
            version: APP_VERSION,
            cache: CACHE_NAME
        });
    }
});

/**
 * Background Sync (se supportato)
 */
self.addEventListener('sync', (event) => {
    console.log('[ServiceWorker] Sync event:', event.tag);
    
    if (event.tag === 'sync-data') {
        // Potenziale sync futuro con backend
        event.waitUntil(Promise.resolve());
    }
});
