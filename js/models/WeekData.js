/**
 * WeekData - Model per i dati di una settimana
 * 
 * @description Gestisce la collezione di entry per una settimana,
 * incluse operazioni CRUD, calcoli e validazione.
 */

import { TimeEntry, SMART_HOURS } from './TimeEntry.js';
import { 
    getWeekKey, 
    getWeekNumber,
    getWorkWeekDates, 
    formatDateISO, 
    isFriday, 
    parseWeekKey,
    parseDateISO
} from '../utils/DateUtils.js';

/**
 * Classe che rappresenta i dati di una settimana
 */
export class WeekData {
    /**
     * @param {number} year - Anno ISO
     * @param {number} week - Numero settimana
     * @param {Object} [initialData] - Dati iniziali
     */
    constructor(year, week, initialData = {}) {
        this.year = year;
        this.week = week;
        this.weekKey = getWeekKey(year, week);
        
        /** @type {Map<string, TimeEntry[]>} Mappa data -> entries */
        this.entries = new Map();
        
        // Inizializza con i giorni lavorativi
        this.initializeWorkDays();
        
        // Carica dati iniziali se forniti
        if (initialData && Object.keys(initialData).length > 0) {
            this.loadFromJSON(initialData);
        }
    }

    /**
     * Inizializza i giorni lavorativi della settimana
     */
    initializeWorkDays() {
        const dates = getWorkWeekDates(this.year, this.week);
        dates.forEach(date => {
            const dateKey = formatDateISO(date);
            if (!this.entries.has(dateKey)) {
                this.entries.set(dateKey, []);
            }
        });
    }

    /**
     * Ottiene le date lavorative della settimana
     * @returns {string[]} Array di date in formato ISO
     */
    getWorkDates() {
        return Array.from(this.entries.keys()).sort();
    }

    /**
     * Ottiene le entry per un giorno specifico
     * @param {string} dateKey - Data in formato ISO
     * @returns {TimeEntry[]}
     */
    getEntriesForDate(dateKey) {
        return this.entries.get(dateKey) || [];
    }

    /**
     * Aggiunge un'entry a un giorno
     * @param {string} dateKey - Data in formato ISO
     * @param {TimeEntry|Object} entry - Entry da aggiungere
     * @returns {TimeEntry} L'entry aggiunta
     */
    addEntry(dateKey, entry) {
        // Assicurati che l'entry sia un'istanza di TimeEntry
        const timeEntry = entry instanceof TimeEntry ? entry : new TimeEntry(entry);
        
        // Verifica se è un tipo speciale (smart/assente)
        if (timeEntry.isSpecial()) {
            // I tipi speciali sostituiscono tutte le entry del giorno
            this.clearDay(dateKey);
            
            // Aggiusta le ore per il venerdì
            if (timeEntry.isSmart() && isFriday(parseDateISO(dateKey))) {
                timeEntry.hours = SMART_HOURS.FRIDAY;
            }
        }
        
        // Inizializza l'array se non esiste
        if (!this.entries.has(dateKey)) {
            this.entries.set(dateKey, []);
        }
        
        this.entries.get(dateKey).push(timeEntry);
        
        return timeEntry;
    }

    /**
     * Aggiorna un'entry specifica
     * @param {string} dateKey - Data in formato ISO
     * @param {number} index - Indice dell'entry
     * @param {Object} updates - Dati da aggiornare
     * @returns {TimeEntry|null} L'entry aggiornata o null se non trovata
     */
    updateEntry(dateKey, index, updates) {
        const entries = this.entries.get(dateKey);
        if (!entries || index < 0 || index >= entries.length) {
            return null;
        }
        
        const entry = entries[index];
        
        // Se cambia il tipo a speciale, rimuovi le altre entry
        if (updates.type && ['smart', 'assente'].includes(updates.type) && !entry.isSpecial()) {
            const updatedEntry = entry.update(updates);
            this.clearDay(dateKey);
            this.entries.get(dateKey).push(updatedEntry);
            return updatedEntry;
        }
        
        return entry.update(updates);
    }

    /**
     * Elimina un'entry specifica
     * @param {string} dateKey - Data in formato ISO
     * @param {number} index - Indice dell'entry da eliminare
     * @returns {TimeEntry|null} L'entry eliminata o null se non trovata
     */
    deleteEntry(dateKey, index) {
        const entries = this.entries.get(dateKey);
        if (!entries || index < 0 || index >= entries.length) {
            return null;
        }
        
        const [deleted] = entries.splice(index, 1);
        return deleted;
    }

    /**
     * Elimina tutte le entry di un giorno
     * @param {string} dateKey - Data in formato ISO
     */
    clearDay(dateKey) {
        if (this.entries.has(dateKey)) {
            this.entries.set(dateKey, []);
        }
    }

    /**
     * Verifica se un giorno ha entry
     * @param {string} dateKey - Data in formato ISO
     * @returns {boolean}
     */
    hasEntries(dateKey) {
        const entries = this.entries.get(dateKey);
        return entries && entries.length > 0;
    }

    /**
     * Verifica se un giorno è di tipo speciale (smart/assente)
     * @param {string} dateKey - Data in formato ISO
     * @returns {boolean}
     */
    isSpecialDay(dateKey) {
        const entries = this.entries.get(dateKey);
        return entries && entries.length === 1 && entries[0].isSpecial();
    }

    /**
     * Ottiene il tipo speciale del giorno, se presente
     * @param {string} dateKey - Data in formato ISO
     * @returns {string|null} 'smart', 'assente', o null
     */
    getSpecialDayType(dateKey) {
        const entries = this.entries.get(dateKey);
        if (entries && entries.length === 1 && entries[0].isSpecial()) {
            return entries[0].type;
        }
        return null;
    }

    /**
     * Conta le entry per tipo in un giorno
     * @param {string} dateKey - Data in formato ISO
     * @returns {{entrata: number, uscita: number, smart: number, assente: number}}
     */
    countEntriesByType(dateKey) {
        const counts = { entrata: 0, uscita: 0, smart: 0, assente: 0 };
        const entries = this.entries.get(dateKey) || [];
        
        entries.forEach(entry => {
            if (counts.hasOwnProperty(entry.type)) {
                counts[entry.type]++;
            }
        });
        
        return counts;
    }

    /**
     * Verifica se ci sono entry non accoppiate (entrata senza uscita)
     * @param {string} dateKey - Data in formato ISO
     * @returns {boolean}
     */
    hasUnpairedEntries(dateKey) {
        const counts = this.countEntriesByType(dateKey);
        return counts.entrata !== counts.uscita;
    }

    /**
     * Ottiene l'ultima entry di un giorno
     * @param {string} dateKey - Data in formato ISO
     * @returns {TimeEntry|null}
     */
    getLastEntry(dateKey) {
        const entries = this.entries.get(dateKey);
        if (!entries || entries.length === 0) {
            return null;
        }
        return entries[entries.length - 1];
    }

    /**
     * Verifica se la prossima entry attesa è un'uscita
     * @param {string} dateKey - Data in formato ISO
     * @returns {boolean}
     */
    expectsUscita(dateKey) {
        const lastEntry = this.getLastEntry(dateKey);
        return lastEntry && lastEntry.isEntrata();
    }

    /**
     * Carica dati da un oggetto JSON
     * @param {Object} data - Dati nel formato {dateKey: [{type, time, hours}]}
     */
    loadFromJSON(data) {
        for (const [dateKey, entries] of Object.entries(data)) {
            if (Array.isArray(entries)) {
                entries.forEach(entryData => {
                    this.addEntry(dateKey, entryData);
                });
            }
        }
    }

    /**
     * Converte i dati in oggetto JSON per serializzazione
     * @returns {Object}
     */
    toJSON() {
        const json = {};
        
        for (const [dateKey, entries] of this.entries) {
            if (entries.length > 0) {
                json[dateKey] = entries.map(entry => entry.toJSON());
            }
        }
        
        return json;
    }

    /**
     * Verifica se la settimana è vuota (nessuna entry)
     * @returns {boolean}
     */
    isEmpty() {
        for (const entries of this.entries.values()) {
            if (entries.length > 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Ottiene il numero totale di entry nella settimana
     * @returns {number}
     */
    getTotalEntryCount() {
        let count = 0;
        for (const entries of this.entries.values()) {
            count += entries.length;
        }
        return count;
    }

    /**
     * Crea una WeekData da una chiave settimana e dati
     * @param {string} weekKey - Chiave settimana (es. "2026-W05")
     * @param {Object} [data] - Dati iniziali
     * @returns {WeekData}
     */
    static fromWeekKey(weekKey, data = {}) {
        const { year, week } = parseWeekKey(weekKey);
        return new WeekData(year, week, data);
    }

    /**
     * Crea una WeekData per la settimana corrente
     * @param {Object} [data] - Dati iniziali
     * @returns {WeekData}
     */
    static forCurrentWeek(data = {}) {
        const today = new Date();
        const year = today.getFullYear();
        const week = getWeekNumber(today);
        return new WeekData(year, week, data);
    }
}

export default WeekData;
