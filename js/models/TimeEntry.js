/**
 * TimeEntry - Model per una singola registrazione oraria
 * 
 * @description Rappresenta una singola entry (entrata, uscita, smart, assente)
 * con validazione incorporata e metodi di utilità.
 */

import { validateEntry, normalizeTime, isSpecialType, requiresTime } from '../utils/Validators.js';

/**
 * Ore predefinite per Smart Working
 */
export const SMART_HOURS = {
    DEFAULT: 7.5,  // Lunedì-Giovedì
    FRIDAY: 6      // Venerdì
};

/**
 * Ore predefinite per Assente (= giornata completa)
 */
export const ABSENT_HOURS = {
    DEFAULT: 7.5,  // Lunedì-Giovedì (uguale a presenza)
    FRIDAY: 6      // Venerdì
};

/**
 * Classe che rappresenta una singola registrazione
 */
export class TimeEntry {
    /**
     * @param {Object} data - Dati dell'entry
     * @param {string} data.type - Tipo: 'entrata', 'uscita', 'smart', 'assente'
     * @param {string} [data.time] - Orario HH:MM (per entrata/uscita)
     * @param {number} [data.hours] - Ore assegnate (per smart/assente)
     * @param {string} [data.id] - ID univoco (generato se non fornito)
     * @param {number} [data.createdAt] - Timestamp creazione
     */
    constructor(data) {
        this.id = data.id || this.generateId();
        this.type = data.type;
        this.time = requiresTime(data.type) ? normalizeTime(data.time) : null;
        this.hours = isSpecialType(data.type) ? (data.hours ?? this.getDefaultHours(data.type)) : null;
        this.createdAt = data.createdAt || Date.now();
    }

    /**
     * Genera un ID univoco per l'entry
     * @returns {string}
     */
    generateId() {
        return `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Ottiene le ore predefinite per un tipo speciale
     * @param {string} type - Tipo di entry
     * @param {boolean} [isFriday=false] - Se è venerdì
     * @returns {number}
     */
    getDefaultHours(type, isFriday = false) {
        if (type === 'smart') {
            return isFriday ? SMART_HOURS.FRIDAY : SMART_HOURS.DEFAULT;
        }
        if (type === 'assente') {
            return isFriday ? ABSENT_HOURS.FRIDAY : ABSENT_HOURS.DEFAULT;
        }
        return 0;
    }

    /**
     * Verifica se l'entry è valida
     * @returns {boolean}
     */
    isValid() {
        const validation = validateEntry(this.toJSON());
        return validation.valid;
    }

    /**
     * Verifica se è un'entrata
     * @returns {boolean}
     */
    isEntrata() {
        return this.type === 'entrata';
    }

    /**
     * Verifica se è un'uscita
     * @returns {boolean}
     */
    isUscita() {
        return this.type === 'uscita';
    }

    /**
     * Verifica se è Smart Working
     * @returns {boolean}
     */
    isSmart() {
        return this.type === 'smart';
    }

    /**
     * Verifica se è Assente
     * @returns {boolean}
     */
    isAssente() {
        return this.type === 'assente';
    }

    /**
     * Verifica se è un tipo speciale (smart/assente)
     * @returns {boolean}
     */
    isSpecial() {
        return isSpecialType(this.type);
    }

    /**
     * Ottiene l'etichetta del tipo in italiano
     * @returns {string}
     */
    getTypeLabel() {
        const labels = {
            'entrata': 'Entrata',
            'uscita': 'Uscita',
            'smart': 'Smart Working',
            'assente': 'Assente'
        };
        return labels[this.type] || this.type;
    }

    /**
     * Ottiene l'icona del tipo
     * @returns {string}
     */
    getTypeIcon() {
        const icons = {
            'entrata': '🟢',
            'uscita': '🔴',
            'smart': '🏠',
            'assente': '❌'
        };
        return icons[this.type] || '⚪';
    }

    /**
     * Aggiorna i dati dell'entry
     * @param {Object} updates - Dati da aggiornare
     * @returns {TimeEntry} this per chaining
     */
    update(updates) {
        if (updates.type !== undefined) {
            this.type = updates.type;
        }
        if (updates.time !== undefined && requiresTime(this.type)) {
            this.time = normalizeTime(updates.time);
        }
        if (updates.hours !== undefined && isSpecialType(this.type)) {
            this.hours = updates.hours;
        }
        return this;
    }

    /**
     * Clona l'entry
     * @returns {TimeEntry}
     */
    clone() {
        return new TimeEntry({
            type: this.type,
            time: this.time,
            hours: this.hours,
            id: this.generateId(), // Nuovo ID per il clone
            createdAt: Date.now()
        });
    }

    /**
     * Converte l'entry in oggetto plain per serializzazione
     * @returns {Object}
     */
    toJSON() {
        const json = {
            type: this.type
        };

        // Includi sempre time per entry che lo richiedono (anche se null)
        if (requiresTime(this.type)) {
            json.time = this.time || null;
        }

        if (this.hours !== null) {
            json.hours = this.hours;
        }

        return json;
    }

    /**
     * Crea un'entry da un oggetto plain
     * @param {Object} data - Dati dell'entry
     * @returns {TimeEntry}
     */
    static fromJSON(data) {
        return new TimeEntry(data);
    }

    /**
     * Crea un'entry di tipo Entrata
     * @param {string} time - Orario HH:MM
     * @returns {TimeEntry}
     */
    static createEntrata(time) {
        return new TimeEntry({ type: 'entrata', time });
    }

    /**
     * Crea un'entry di tipo Uscita
     * @param {string} time - Orario HH:MM
     * @returns {TimeEntry}
     */
    static createUscita(time) {
        return new TimeEntry({ type: 'uscita', time });
    }

    /**
     * Crea un'entry di tipo Smart Working
     * @param {boolean} [isFriday=false] - Se è venerdì
     * @returns {TimeEntry}
     */
    static createSmart(isFriday = false) {
        return new TimeEntry({
            type: 'smart',
            hours: isFriday ? SMART_HOURS.FRIDAY : SMART_HOURS.DEFAULT
        });
    }

    /**
     * Crea un'entry di tipo Assente
     * L'assenza conta come giornata lavorativa completa per il conteggio settimanale
     * @param {boolean} [isFriday=false] - Se è venerdì
     * @returns {TimeEntry}
     */
    static createAssente(isFriday = false) {
        return new TimeEntry({
            type: 'assente',
            hours: isFriday ? ABSENT_HOURS.FRIDAY : ABSENT_HOURS.DEFAULT
        });
    }
}

export default TimeEntry;
