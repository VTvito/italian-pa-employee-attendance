/**
 * StorageManager - Repository pattern per gestione storage
 * 
 * @description Coordina l'accesso ai dati tra localStorage (primary) e
 * IndexedDB (backup). Implementa dual storage con fallback automatico.
 */

import { LocalStorageAdapter } from './LocalStorageAdapter.js';
import { IndexedDBAdapter } from './IndexedDBAdapter.js';
import { eventBus, EVENTS } from '../utils/EventBus.js';
import { parseWeekKey, getWeekStartDate } from '../utils/DateUtils.js';

const OLD_DATA_CHECK_DAYS = 30;   // Controllo dati vecchi ogni N giorni
const OLD_DATA_THRESHOLD_MONTHS = 3; // Soglia per dati "vecchi"

export class StorageManager {
    constructor() {
        this.localStorage = new LocalStorageAdapter();
        this.indexedDB = new IndexedDBAdapter();
        this.isInitialized = false;
        this.useIndexedDB = false;
    }

    /**
     * Inizializza lo storage manager
     * @returns {Promise<boolean>}
     */
    async init() {
        // Inizializza localStorage (sincrono, sempre disponibile)
        const lsReady = await this.localStorage.init();
        
        // Prova a inizializzare IndexedDB
        this.useIndexedDB = await this.indexedDB.init();
        
        if (this.useIndexedDB) {
            console.log('StorageManager: IndexedDB disponibile');
            // Migra dati da localStorage se necessario
            await this.migrateFromLocalStorage();
        } else {
            console.warn('StorageManager: IndexedDB non disponibile, uso solo localStorage');
        }

        this.isInitialized = true;
        return lsReady;
    }

    /**
     * Migra dati da localStorage a IndexedDB (se non già presenti)
     * @returns {Promise<void>}
     */
    async migrateFromLocalStorage() {
        if (!this.useIndexedDB) return;

        try {
            const lsData = await this.localStorage.loadAllData();
            const idbKeys = await this.indexedDB.getWeekKeys();

            // Se IndexedDB è vuoto ma localStorage ha dati, migra
            if (idbKeys.length === 0 && Object.keys(lsData).length > 0) {
                console.log('StorageManager: Migrazione dati da localStorage a IndexedDB');
                await this.indexedDB.saveAllData(lsData);
            }
        } catch (e) {
            console.error('Errore migrazione:', e);
        }
    }

    /**
     * Salva tutti i dati
     * @param {Object} data - Dati da salvare
     * @returns {Promise<boolean>}
     */
    async saveAllData(data) {
        try {
            // Salva sempre su localStorage (primary)
            await this.localStorage.saveAllData(data);

            // Salva su IndexedDB se disponibile
            if (this.useIndexedDB) {
                await this.indexedDB.saveAllData(data);
            }

            // Emetti evento
            eventBus.emit(EVENTS.DATA_SAVED, { timestamp: Date.now() });

            return true;
        } catch (e) {
            console.error('Errore salvataggio:', e);
            eventBus.emit(EVENTS.APP_ERROR, { 
                message: 'Errore salvataggio dati', 
                error: e 
            });
            return false;
        }
    }

    /**
     * Carica tutti i dati
     * localStorage è il primary storage: si legge da esso per primo.
     * Se vuoto, si prova IndexedDB come fallback.
     * @returns {Promise<Object>}
     */
    async loadAllData() {
        try {
            // Leggi prima da localStorage (primary storage)
            const lsData = await this.localStorage.loadAllData();
            if (Object.keys(lsData).length > 0) {
                eventBus.emit(EVENTS.DATA_LOADED, { source: 'localStorage' });
                return lsData;
            }

            // Fallback a IndexedDB se localStorage è vuoto
            if (this.useIndexedDB && this.indexedDB.isReady()) {
                const idbData = await this.indexedDB.loadAllData();
                if (Object.keys(idbData).length > 0) {
                    eventBus.emit(EVENTS.DATA_LOADED, { source: 'indexedDB' });
                    return idbData;
                }
            }

            // Entrambi gli storage sono vuoti: ritorna oggetto vuoto
            return lsData;
        } catch (e) {
            console.error('Errore caricamento:', e);
            eventBus.emit(EVENTS.APP_ERROR, { 
                message: 'Errore caricamento dati', 
                error: e 
            });
            return {};
        }
    }

    /**
     * Salva i dati di una settimana
     * @param {string} weekKey - Chiave settimana
     * @param {Object} weekData - Dati della settimana
     * @returns {Promise<boolean>}
     */
    async saveWeekData(weekKey, weekData) {
        try {
            // Carica dati esistenti
            const allData = await this.loadAllData();
            
            // Aggiorna o aggiungi la settimana
            allData[weekKey] = weekData;
            
            // Salva tutto
            return this.saveAllData(allData);
        } catch (e) {
            console.error(`Errore salvataggio settimana ${weekKey}:`, e);
            return false;
        }
    }

    /**
     * Carica i dati di una settimana
     * @param {string} weekKey - Chiave settimana
     * @returns {Promise<Object|null>}
     */
    async loadWeekData(weekKey) {
        const allData = await this.loadAllData();
        return allData[weekKey] || null;
    }

    /**
     * Elimina i dati di una settimana
     * @param {string} weekKey - Chiave settimana
     * @returns {Promise<boolean>}
     */
    async deleteWeekData(weekKey) {
        try {
            const allData = await this.loadAllData();
            
            if (allData[weekKey]) {
                delete allData[weekKey];
                return this.saveAllData(allData);
            }
            return true;
        } catch (e) {
            console.error(`Errore eliminazione settimana ${weekKey}:`, e);
            return false;
        }
    }

    /**
     * Ottiene tutte le chiavi settimana salvate
     * @returns {Promise<string[]>}
     */
    async getWeekKeys() {
        const allData = await this.loadAllData();
        return Object.keys(allData).sort();
    }

    /**
     * Ripristina l'ultimo backup
     * @returns {Promise<Object|null>}
     */
    async restoreLastBackup() {
        if (!this.useIndexedDB) {
            return null;
        }

        try {
            const lastBackup = await this.indexedDB.getLastBackup();
            if (lastBackup) {
                await this.saveAllData(lastBackup.data);
                return lastBackup.data;
            }
            return null;
        } catch (e) {
            console.error('Errore ripristino backup:', e);
            return null;
        }
    }

    /**
     * Trova settimane più vecchie di N mesi
     * @param {number} months - Numero di mesi
     * @returns {Promise<string[]>} Chiavi delle settimane vecchie
     */
    async findOldWeeks(months = OLD_DATA_THRESHOLD_MONTHS) {
        const weekKeys = await this.getWeekKeys();
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - months);

        const oldWeeks = [];
        
        for (const weekKey of weekKeys) {
            try {
                const { year, week } = parseWeekKey(weekKey);
                // Usa il lunedì ISO della settimana come data di riferimento
                const weekStartDate = getWeekStartDate(year, week);
                if (weekStartDate < cutoffDate) {
                    oldWeeks.push(weekKey);
                }
            } catch (e) {
                // Chiave non valida, ignora
            }
        }

        return oldWeeks;
    }

    /**
     * Pulisce i dati più vecchi di N mesi
     * @param {string[]} weekKeys - Chiavi delle settimane da eliminare
     * @returns {Promise<number>} Numero di settimane eliminate
     */
    async cleanOldData(weekKeys) {
        if (!weekKeys || weekKeys.length === 0) return 0;

        try {
            const allData = await this.loadAllData();
            let deleted = 0;

            for (const weekKey of weekKeys) {
                if (weekKey in allData) {
                    delete allData[weekKey];
                    deleted++;
                }
            }

            if (deleted > 0) {
                await this.saveAllData(allData);
            }

            return deleted;
        } catch (e) {
            console.error('Errore pulizia dati vecchi:', e);
            return 0;
        }
    }

    /**
     * Importa dati da JSON
     * @param {Object} importData - Dati da importare
     * @param {boolean} [merge=true] - Se true, unisce con dati esistenti
     * @returns {Promise<{success: boolean, imported: number, existing: number}>}
     */
    async importData(importData, merge = true) {
        try {
            let existing = 0;
            let imported = 0;

            if (merge) {
                const currentData = await this.loadAllData();
                
                for (const [weekKey, weekData] of Object.entries(importData)) {
                    if (currentData[weekKey]) {
                        existing++;
                    } else {
                        currentData[weekKey] = weekData;
                        imported++;
                    }
                }

                await this.saveAllData(currentData);
            } else {
                await this.saveAllData(importData);
                imported = Object.keys(importData).length;
            }

            return { success: true, imported, existing };
        } catch (e) {
            console.error('Errore importazione:', e);
            return { success: false, imported: 0, existing: 0 };
        }
    }

    /**
     * Esporta tutti i dati in formato JSON
     * @returns {Promise<string>}
     */
    async exportData() {
        const data = await this.loadAllData();
        return JSON.stringify(data, null, 2);
    }
}

export default StorageManager;
