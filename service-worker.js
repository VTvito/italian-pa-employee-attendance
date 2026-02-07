/**
 * Service Worker - Caching e Offline Support
 * 
 * @description Gestisce il caching delle risorse per funzionamento offline
 * e aggiornamenti dell'applicazione.
 */

// IMPORTANTE: Incrementa questo numero per forzare l'aggiornamento dell'app
const CACHE_NAME = 'orari-lavoro-v10';

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
 */
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Install');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[ServiceWorker] Caching app shell');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => {
                // Forza attivazione immediata
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[ServiceWorker] Cache failed:', error);
            })
    );
});

/**
 * Evento Activate - Pulizia vecchie cache
 */
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activate');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => cacheName !== CACHE_NAME)
                        .map((cacheName) => {
                            console.log('[ServiceWorker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                // Prendi controllo immediato di tutte le pagine
                return self.clients.claim();
            })
    );
});

/**
 * Evento Fetch - Strategia Cache-First con fallback Network
 */
self.addEventListener('fetch', (event) => {
    // Ignora richieste non-GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Ignora richieste a URL esterni
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Risorsa in cache - ritorna e aggiorna in background
                    fetchAndCache(event.request);
                    return cachedResponse;
                }

                // Non in cache - fetch dalla rete
                return fetchAndCache(event.request);
            })
            .catch(() => {
                // Fallback per pagine HTML
                if (event.request.headers.get('accept').includes('text/html')) {
                    return caches.match('/index.html');
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
 */
self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
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
