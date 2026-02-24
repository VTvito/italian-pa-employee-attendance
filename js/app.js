/**
 * App Entry Point - Inizializzazione applicazione
 * 
 * @description Bootstrap dell'applicazione. Gestisce il caricamento iniziale,
 * la registrazione del Service Worker e l'avvio del controller principale.
 */

import { AppController } from './controllers/AppController.js';
import { eventBus, EVENTS } from './utils/EventBus.js';

// Istanza globale del controller (per debug)
let app = null;

/**
 * Inizializza l'applicazione
 */
async function initApp() {
    console.log('🕐 Orari Lavoro - Inizializzazione...');

    try {
        // Crea e inizializza il controller
        app = new AppController();
        await app.init();

        // Gestisci eventuali shortcut (entrata/uscita) da homescreen
        await handleQuickAction(app);

        // Registra Service Worker per PWA
        await registerServiceWorker();

        console.log('✅ Applicazione inizializzata');

    } catch (error) {
        console.error('❌ Errore inizializzazione:', error);
        showFatalError(error);
    }
}

/**
 * Gestisce shortcut PWA (entrata/uscita) via query string
 * Esempio: ?action=entrata | ?action=uscita
 * @param {AppController} appController
 */
async function handleQuickAction(appController) {
    try {
        const url = new URL(window.location.href);
        const action = url.searchParams.get('action');

        if (!action) return;

        if (action === 'entrata') {
            await appController.handleEntrata();
        } else if (action === 'uscita') {
            await appController.handleUscita();
        }

        // Pulisci query string per evitare doppie timbrature al refresh
        url.searchParams.delete('action');
        window.history.replaceState({}, document.title, url.pathname + url.hash);
    } catch (e) {
        console.warn('Errore gestione shortcut:', e);
    }
}

/**
 * Registra il Service Worker
 * 
 * Flusso aggiornamento:
 * 1. Detecta nuovo SW installato (in stato "waiting")
 * 2. Mostra banner non invasivo "Nuova versione disponibile"
 * 3. Utente clicca "Aggiorna" → invia skipWaiting al SW waiting
 * 4. SW si attiva → controllerchange → verifica dati → reload
 */
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const swPath = './service-worker.js';
        const registration = await navigator.serviceWorker.register(swPath);
        console.log('Service Worker registrato:', registration.scope);

        // Rileva un nuovo SW appena installato
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
                // Un nuovo SW è pronto e in attesa di attivazione
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[App] Nuovo SW in waiting — mostro banner aggiornamento');
                    showUpdateNotification(registration);
                }
            });
        });

        // Se al caricamento c'è già un SW in waiting (reload senza aver aggiornato)
        if (registration.waiting && navigator.serviceWorker.controller) {
            showUpdateNotification(registration);
        }

        // Controlla aggiornamenti all'avvio
        checkForUpdates(registration);

        // Controlla anche quando l'app torna in primo piano
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                checkForUpdates(registration);
            }
        });

        // Ascolta messaggi dal SW (es. SW_ACTIVATED dopo aggiornamento)
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'SW_ACTIVATED') {
                console.log(`[App] SW attivato: v${event.data.version}`);
            }
        });

    } catch (error) {
        console.warn('Service Worker non registrato:', error.message);
    }
}

/**
 * Forza controllo aggiornamenti del service worker
 */
async function checkForUpdates(registration) {
    try {
        console.log('[App] Controllo aggiornamenti...');
        await registration.update();
    } catch (error) {
        console.log('[App] Controllo aggiornamenti fallito (offline?):', error.message);
    }
}

/**
 * Mostra notifica di aggiornamento disponibile
 * 
 * Banner fisso in alto con pulsante "Aggiorna".
 * Il reload avviene SOLO dopo:
 * 1. Verifica integrità dati (localStorage leggibile)
 * 2. Il nuovo SW ha preso il controllo (controllerchange)
 * 
 * @param {ServiceWorkerRegistration} registration
 */
function showUpdateNotification(registration) {
    if (document.getElementById('update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
        <div class="update-banner-inner">
            <div class="update-banner-text">
                <strong>🎉 Nuova versione disponibile</strong>
                <span>I tuoi dati NON verranno toccati.</span>
            </div>
            <div class="update-banner-actions">
                <button id="update-btn" class="update-btn-primary">Aggiorna ora</button>
                <button id="update-dismiss" class="update-btn-dismiss">Dopo</button>
            </div>
        </div>
    `;
    document.body.prepend(banner);

    // Click "Aggiorna ora"
    document.getElementById('update-btn').addEventListener('click', async () => {
        const btn = document.getElementById('update-btn');
        btn.disabled = true;
        btn.textContent = 'Aggiornamento…';

        try {
            // 1. Verifica dati prima di procedere
            const dataOk = verifyDataIntegrity();
            if (!dataOk) {
                console.warn('[App] Integrità dati dubbia — procedo comunque (dati in localStorage persistono)');
            }

            // 2. Registra listener per quando il nuovo SW prende il controllo
            const controllerChanged = new Promise((resolve) => {
                navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
            });

            // 3. Chiedi al SW in waiting di attivarsi
            const reg = registration || await navigator.serviceWorker.getRegistration();
            if (reg?.waiting) {
                reg.waiting.postMessage({ action: 'skipWaiting' });
            } else {
                // Nessun SW in waiting, reload diretto
                window.location.reload();
                return;
            }

            // 4. Aspetta il cambio controller (max 5s timeout)
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 5000)
            );

            await Promise.race([controllerChanged, timeout]).catch(() => {
                console.warn('[App] Timeout attesa controllerchange, reload forzato');
            });

            // 5. Verifica dati di nuovo dopo l'attivazione
            verifyDataIntegrity();

            // 6. Reload pulito
            window.location.reload();

        } catch (e) {
            console.error('[App] Errore aggiornamento:', e);
            window.location.reload();
        }
    });

    // Click "Dopo" — nasconde il banner per questa sessione
    document.getElementById('update-dismiss').addEventListener('click', () => {
        banner.remove();
    });
}

/**
 * Verifica integrità dei dati utente in localStorage
 * @returns {boolean} true se i dati sono leggibili e validi
 */
function verifyDataIntegrity() {
    try {
        const raw = localStorage.getItem('workTimeData');
        if (!raw) {
            console.log('[App] Nessun dato in localStorage (utente nuovo o dati vuoti)');
            return true;
        }
        const data = JSON.parse(raw);
        const weekCount = Object.keys(data).length;
        console.log(`[App] Verifica dati OK: ${weekCount} settimane trovate`);
        return true;
    } catch (e) {
        console.error('[App] Dati localStorage corrotti:', e);
        return false;
    }
}

// Debug: mostra base URL
console.log('App base URL:', window.location.pathname);

/**
 * Mostra errore fatale
 * @param {Error} error 
 */
function showFatalError(error) {
    const container = document.querySelector('.app-container');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <h1>⚠️ Errore</h1>
                <p>Si è verificato un errore durante il caricamento dell'applicazione.</p>
                <p style="color: #666; font-size: 0.9rem;">${error.message}</p>
                <button onclick="location.reload()" style="
                    margin-top: 1rem;
                    padding: 0.5rem 1rem;
                    background: #2563eb;
                    color: white;
                    border: none;
                    border-radius: 0.5rem;
                    cursor: pointer;
                ">
                    Ricarica pagina
                </button>
            </div>
        `;
    }
}

/**
 * Gestione errori globali
 */
window.addEventListener('error', (event) => {
    console.error('Errore globale:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Promise non gestita:', event.reason);
});

// Avvia l'app quando il DOM è pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Esporta per debug da console
window.__app = () => app;
