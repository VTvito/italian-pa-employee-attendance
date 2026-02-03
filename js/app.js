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

        // Registra Service Worker per PWA
        await registerServiceWorker();

        console.log('✅ Applicazione inizializzata');

    } catch (error) {
        console.error('❌ Errore inizializzazione:', error);
        showFatalError(error);
    }
}

/**
 * Registra il Service Worker
 */
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            // Usa path relativo per supportare GitHub Pages
            const swPath = './service-worker.js';
            const registration = await navigator.serviceWorker.register(swPath);

            console.log('Service Worker registrato:', registration.scope);

            // Gestione aggiornamenti
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Nuova versione disponibile
                        console.log('Nuova versione dell\'app disponibile');
                        showUpdateNotification();
                    }
                });
            });
            
            // Controlla se c'è già un worker in attesa
            if (registration.waiting) {
                showUpdateNotification();
            }
            
            // Forza controllo aggiornamenti all'avvio e periodicamente
            checkForUpdates(registration);
            
            // Controlla aggiornamenti quando l'app torna in primo piano
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    checkForUpdates(registration);
                }
            });

        } catch (error) {
            console.warn('Service Worker non registrato:', error.message);
            // Non bloccare l'app se il SW fallisce
        }
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
 */
function showUpdateNotification() {
    // Crea un banner di aggiornamento in alto nella pagina
    const existingBanner = document.getElementById('update-banner');
    if (existingBanner) return; // Già mostrato
    
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(90deg, #059669, #10b981);
            color: white;
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            font-family: inherit;
        ">
            <span>🎉 <strong>Nuova versione disponibile!</strong></span>
            <button id="update-btn" style="
                background: white;
                color: #059669;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-weight: bold;
                cursor: pointer;
            ">
                Aggiorna ora
            </button>
        </div>
    `;
    
    document.body.prepend(banner);
    
    // Gestisci click su aggiorna
    document.getElementById('update-btn').addEventListener('click', () => {
        // Ricarica la pagina per applicare l'aggiornamento
        window.location.reload();
    });
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
