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
const CACHE_NAME = 'timbra-pa-v43';

// Versione leggibile per logging
const APP_VERSION = '2.5.7';

// Timeout brevi per evitare che su iPhone una rete assente o instabile
// faccia sembrare l'app non disponibile offline.
const NAVIGATION_NETWORK_TIMEOUT_MS = 1200;
const APP_SHELL_NETWORK_TIMEOUT_MS = 1500;

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

const APP_SHELL_PATHS = new Set([
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
    BASE_PATH + 'manifest.json'
]);

const CRITICAL_CACHE_URLS = Array.from(APP_SHELL_PATHS).filter((url) => {
    return url !== BASE_PATH && url !== BASE_PATH + 'manifest.json';
});

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
        precacheResources()
            .then(() => {
                console.log('[SW] Pre-cache completato. In attesa di attivazione utente.');
                // ⚠️ NON chiamo skipWaiting() qui.
                // Il SW resta in "waiting" fino a postMessage({action:'skipWaiting'})
            })
            .catch((error) => {
                console.error('[SW] Pre-cache fallito:', error);
                throw error;
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
 * Evento Fetch - Strategia ibrida per evitare stati misti dopo update
 * 
 * - App shell (HTML, JS, CSS, manifest): network-first con fallback cache
 * - Asset statici secondari (icone): cache-first con revalidate in background
 */
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;
    if (!event.request.url.startsWith('http')) return;

    const requestUrl = new URL(event.request.url);

    if (isAppShellRequest(event.request, requestUrl)) {
        event.respondWith(fetchNetworkFirst(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    fetchAndCache(event.request);
                    return cachedResponse;
                }
                return fetchAndCache(event.request);
            })
            .catch(async () => {
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return getOfflineNavigationFallback();
                }
            })
    );
});

/**
 * Determina se la request riguarda l'app shell core.
 * Questi file devono preferire la rete per evitare mix di versioni.
 * @param {Request} request
 * @param {URL} requestUrl
 * @returns {boolean}
 */
function isAppShellRequest(request, requestUrl) {
    if (request.mode === 'navigate') {
        return true;
    }

    return APP_SHELL_PATHS.has(requestUrl.pathname);
}

/**
 * Pre-cache robusto: se fallisce una risorsa secondaria non blocca l'offline,
 * ma se manca un file core il SW non si installa.
 * @returns {Promise<void>}
 */
async function precacheResources() {
    const cache = await caches.open(CACHE_NAME);
    console.log('[SW] Pre-caching risorse...');

    const results = await Promise.allSettled(
        CACHE_URLS.map((url) => cache.add(url))
    );

    const failedUrls = results
        .map((result, index) => result.status === 'rejected' ? CACHE_URLS[index] : null)
        .filter(Boolean);

    if (failedUrls.length === 0) {
        return;
    }

    const criticalFailures = failedUrls.filter((url) => CRITICAL_CACHE_URLS.includes(url));

    if (criticalFailures.length > 0) {
        throw new Error(`Risorse core non cacheate: ${criticalFailures.join(', ')}`);
    }

    console.warn('[SW] Risorse secondarie non cacheate:', failedUrls);
}

/**
 * Fallback offline per navigazione top-level.
 * Alcuni browser iOS si comportano meglio con index.html esplicito.
 * @returns {Promise<Response|undefined>}
 */
async function getOfflineNavigationFallback() {
    const cachedIndex = await caches.match(BASE_PATH + 'index.html');
    if (cachedIndex) {
        return cachedIndex;
    }

    return caches.match(BASE_PATH);
}

/**
 * Fetch con timeout breve per evitare attese lunghe prima del fallback cache.
 * 
 * Usa Promise.race come meccanismo primario di timeout: questo garantisce che
 * il timeout scatti sempre, anche su iOS/Safari dove AbortController.abort()
 * nel contesto del Service Worker può essere un no-op.
 * AbortController viene comunque usato per tentare di cancellare la richiesta
 * sottostante e liberare risorse di rete.
 * 
 * @param {Request} request
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(request, timeoutMs) {
    // Promise che rigetta dopo timeoutMs — il meccanismo di timeout affidabile
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SW_TIMEOUT')), timeoutMs)
    );

    let fetchPromise;
    let controller;

    if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        fetchPromise = fetch(request, { cache: 'no-store', signal: controller.signal });
    } else {
        fetchPromise = fetch(request, { cache: 'no-store' });
    }

    try {
        return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (e) {
        // Tenta di cancellare la richiesta pendente per liberare risorse
        if (controller) {
            try { controller.abort(); } catch (_) {}
        }
        throw e;
    }
}

/**
 * Strategia network-first per HTML/JS/CSS/manifest.
 * Quando il browser segnala assenza di rete, servi direttamente dalla cache
 * evitando l'attesa di timeout (cruciale con ~15 moduli ES da caricare).
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function fetchNetworkFirst(request) {
    // Fast path offline: evita timeout network per ogni risorsa
    if (!self.navigator.onLine) {
        const cachedOffline = await caches.match(request);
        if (cachedOffline) {
            return cachedOffline;
        }
        // Nessuna cache disponibile: tenta comunque la rete come ultima risorsa
    }

    try {
        const timeoutMs = request.mode === 'navigate'
            ? NAVIGATION_NETWORK_TIMEOUT_MS
            : APP_SHELL_NETWORK_TIMEOUT_MS;
        const response = await fetchWithTimeout(request, timeoutMs);

        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
            return response;
        }

        // Risposta non-ok dalla rete (es. 503, 404): preferire la cache
        // per non mostrare una pagina di errore quando abbiamo una versione cachata.
        const cachedOnError = await caches.match(request);
        if (cachedOnError) {
            return cachedOnError;
        }

        return response;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        if (request.mode === 'navigate') {
            return getOfflineNavigationFallback();
        }

        throw error;
    }
}

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
