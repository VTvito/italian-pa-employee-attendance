/**
 * LocalStorageAdapter - Adapter per localStorage
 * 
 * @description Implementa l'interfaccia storage per localStorage.
 * Fornisce operazioni CRUD sincrone con serializzazione JSON.
 */

const STORAGE_KEY = 'workTimeData';
const BACKUP_TIME_KEY = 'workTimeLastBackup';
const SAVE_COUNT_KEY = 'workTimeSaveCount';

export class LocalStorageAdapter {
    constructor() {
        this.isAvailable = this.checkAvailability();
    }

    /**
     * Verifica se localStorage è disponibile
     * @returns {boolean}
     */
    checkAvailability() {
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            console.warn('LocalStorage non disponibile:', e);
            return false;
        }
    }

    /**
     * Inizializza l'adapter
     * @returns {Promise<boolean>}
     */
    async init() {
        return this.isAvailable;
    }

    /**
     * Salva tutti i dati
     * @param {Object} data - Dati da salvare
     * @returns {Promise<boolean>}
     */
    async saveAllData(data) {
        if (!this.isAvailable) {
            throw new Error('LocalStorage non disponibile');
        }

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            this.incrementSaveCount();
            return true;
        } catch (e) {
            console.error('Errore salvataggio localStorage:', e);
            throw e;
        }
    }

    /**
     * Carica tutti i dati
     * @returns {Promise<Object>}
     */
    async loadAllData() {
        if (!this.isAvailable) {
            return {};
        }

        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error('Errore caricamento localStorage:', e);
            return {};
        }
    }

    /**
     * Salva i dati di una settimana specifica
     * @param {string} weekKey - Chiave settimana (es. "2026-W05")
     * @param {Object} weekData - Dati della settimana
     * @returns {Promise<boolean>}
     */
    async saveWeekData(weekKey, weekData) {
        const allData = await this.loadAllData();
        allData[weekKey] = weekData;
        return this.saveAllData(allData);
    }

    /**
     * Carica i dati di una settimana specifica
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
        const allData = await this.loadAllData();
        if (allData[weekKey]) {
            delete allData[weekKey];
            return this.saveAllData(allData);
        }
        return true;
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
     * Elimina tutti i dati
     * @returns {Promise<boolean>}
     */
    async clearAll() {
        if (!this.isAvailable) {
            return false;
        }

        try {
            localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch (e) {
            console.error('Errore pulizia localStorage:', e);
            return false;
        }
    }

    /**
     * Ottiene il timestamp dell'ultimo backup
     * @returns {Promise<number|null>}
     */
    async getLastBackupTime() {
        if (!this.isAvailable) return null;
        
        const timestamp = localStorage.getItem(BACKUP_TIME_KEY);
        return timestamp ? parseInt(timestamp, 10) : null;
    }

    /**
     * Imposta il timestamp dell'ultimo backup
     * @param {number} timestamp - Timestamp in millisecondi
     * @returns {Promise<boolean>}
     */
    async setLastBackupTime(timestamp) {
        if (!this.isAvailable) return false;
        
        try {
            localStorage.setItem(BACKUP_TIME_KEY, String(timestamp));
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Ottiene il contatore di salvataggi
     * @returns {Promise<number>}
     */
    async getSaveCount() {
        if (!this.isAvailable) return 0;
        
        const count = localStorage.getItem(SAVE_COUNT_KEY);
        return count ? parseInt(count, 10) : 0;
    }

    /**
     * Incrementa il contatore di salvataggi
     */
    incrementSaveCount() {
        if (!this.isAvailable) return;
        
        try {
            const current = parseInt(localStorage.getItem(SAVE_COUNT_KEY) || '0', 10);
            localStorage.setItem(SAVE_COUNT_KEY, String(current + 1));
        } catch (e) {
            // Ignora errori
        }
    }

    /**
     * Resetta il contatore di salvataggi
     * @returns {Promise<void>}
     */
    async resetSaveCount() {
        if (!this.isAvailable) return;
        
        try {
            localStorage.setItem(SAVE_COUNT_KEY, '0');
        } catch (e) {
            // Ignora errori
        }
    }

    /**
     * Legge un metadato generico da localStorage
     * @param {string} key - Chiave metadata
     * @returns {Promise<string|null>}
     */
    async getMetaValue(key) {
        if (!this.isAvailable) return null;

        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    /**
     * Salva un metadato generico su localStorage
     * @param {string} key - Chiave metadata
     * @param {string} value - Valore da salvare
     * @returns {Promise<boolean>}
     */
    async setMetaValue(key, value) {
        if (!this.isAvailable) return false;

        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Ottiene lo spazio utilizzato in bytes
     * @returns {number}
     */
    getUsedSpace() {
        if (!this.isAvailable) return 0;
        
        let total = 0;
        for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length * 2; // UTF-16 = 2 bytes per char
            }
        }
        return total;
    }

    /**
     * Stima lo spazio disponibile (approssimativo)
     * @returns {number} Bytes disponibili (stima 5MB - usato)
     */
    getAvailableSpace() {
        const maxSpace = 5 * 1024 * 1024; // 5MB tipico
        return Math.max(0, maxSpace - this.getUsedSpace());
    }
}

export default LocalStorageAdapter;
