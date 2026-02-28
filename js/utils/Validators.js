/**
 * Validators - Funzioni di validazione input
 * 
 * @description Validatori per orari, date, tipi di entry e dati JSON.
 * Utilizzati per garantire integrità dei dati in input.
 */

/**
 * Tipi di entry validi
 */
export const VALID_ENTRY_TYPES = ['entrata', 'uscita', 'smart', 'assente'];

/**
 * Tipi che richiedono un orario
 */
export const TIME_REQUIRED_TYPES = ['entrata', 'uscita'];

/**
 * Tipi speciali (non richiedono orario)
 */
export const SPECIAL_TYPES = ['smart', 'assente'];

/**
 * Valida un orario in formato HH:MM
 * @param {string} time - Orario da validare
 * @returns {{valid: boolean, error?: string}}
 */
export function validateTime(time) {
    if (!time || typeof time !== 'string') {
        return { valid: false, error: 'Orario richiesto' };
    }

    const pattern = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!pattern.test(time)) {
        return { valid: false, error: 'Formato orario non valido (HH:MM)' };
    }

    return { valid: true };
}

/**
 * Valida e normalizza un orario in formato HH:MM
 * @param {string} time - Orario da validare
 * @returns {string|null} Orario normalizzato o null se invalido
 */
export function normalizeTime(time) {
    const validation = validateTime(time);
    if (!validation.valid) return null;

    const [hours, minutes] = time.split(':').map(Number);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Valida una data in formato ISO (YYYY-MM-DD)
 * @param {string} date - Data da validare
 * @returns {{valid: boolean, error?: string}}
 */
export function validateDate(date) {
    if (!date || typeof date !== 'string') {
        return { valid: false, error: 'Data richiesta' };
    }

    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(date)) {
        return { valid: false, error: 'Formato data non valido (YYYY-MM-DD)' };
    }

    // Verifica che sia una data valida senza overflow (es. 2026-02-30 → invalida)
    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
    ) {
        return { valid: false, error: 'Data non valida' };
    }

    return { valid: true };
}

/**
 * Valida un tipo di entry
 * @param {string} type - Tipo da validare
 * @returns {{valid: boolean, error?: string}}
 */
export function validateEntryType(type) {
    if (!type || typeof type !== 'string') {
        return { valid: false, error: 'Tipo richiesto' };
    }

    if (!VALID_ENTRY_TYPES.includes(type)) {
        return { valid: false, error: `Tipo non valido. Valori ammessi: ${VALID_ENTRY_TYPES.join(', ')}` };
    }

    return { valid: true };
}

/**
 * Verifica se un tipo richiede un orario
 * @param {string} type - Tipo di entry
 * @returns {boolean}
 */
export function requiresTime(type) {
    return TIME_REQUIRED_TYPES.includes(type);
}

/**
 * Verifica se è un tipo speciale (smart/assente)
 * @param {string} type - Tipo di entry
 * @returns {boolean}
 */
export function isSpecialType(type) {
    return SPECIAL_TYPES.includes(type);
}

/**
 * Valida un'entry completa
 * @param {Object} entry - Entry da validare
 * @param {string} entry.type - Tipo di entry
 * @param {string} [entry.time] - Orario (richiesto per entrata/uscita)
 * @param {number} [entry.hours] - Ore (per smart/assente)
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateEntry(entry) {
    const errors = [];

    if (!entry || typeof entry !== 'object') {
        return { valid: false, errors: ['Entry non valida'] };
    }

    // Valida tipo
    const typeValidation = validateEntryType(entry.type);
    if (!typeValidation.valid) {
        errors.push(typeValidation.error);
    }

    // Valida orario se richiesto
    if (requiresTime(entry.type)) {
        const timeValidation = validateTime(entry.time);
        if (!timeValidation.valid) {
            errors.push(timeValidation.error);
        }
    }

    // Valida ore per tipi speciali
    if (isSpecialType(entry.type)) {
        if (typeof entry.hours !== 'number' || entry.hours < 0) {
            errors.push('Ore non valide per tipo speciale');
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Valida una chiave settimana ISO
 * @param {string} weekKey - Chiave da validare
 * @returns {{valid: boolean, error?: string}}
 */
export function validateWeekKey(weekKey) {
    if (!weekKey || typeof weekKey !== 'string') {
        return { valid: false, error: 'Chiave settimana richiesta' };
    }

    const pattern = /^\d{4}-W([0-4][0-9]|5[0-3])$/;
    if (!pattern.test(weekKey)) {
        return { valid: false, error: 'Formato chiave settimana non valido (YYYY-Www)' };
    }

    return { valid: true };
}

/**
 * Valida la struttura dati completa (per import JSON)
 * @param {Object} data - Dati da validare
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateImportData(data) {
    const errors = [];
    const warnings = [];

    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['Dati non validi'], warnings: [] };
    }

    // Verifica struttura per ogni settimana
    for (const [weekKey, weekData] of Object.entries(data)) {
        // Valida chiave settimana
        const weekKeyValidation = validateWeekKey(weekKey);
        if (!weekKeyValidation.valid) {
            errors.push(`Settimana "${weekKey}": ${weekKeyValidation.error}`);
            continue;
        }

        if (!weekData || typeof weekData !== 'object') {
            errors.push(`Settimana "${weekKey}": dati non validi`);
            continue;
        }

        // Verifica ogni giorno
        for (const [dateKey, entries] of Object.entries(weekData)) {
            // Valida data
            const dateValidation = validateDate(dateKey);
            if (!dateValidation.valid) {
                errors.push(`${weekKey}/${dateKey}: ${dateValidation.error}`);
                continue;
            }

            if (!Array.isArray(entries)) {
                errors.push(`${weekKey}/${dateKey}: entries deve essere un array`);
                continue;
            }

            // Valida ogni entry
            entries.forEach((entry, index) => {
                const entryValidation = validateEntry(entry);
                if (!entryValidation.valid) {
                    warnings.push(`${weekKey}/${dateKey}[${index}]: ${entryValidation.errors.join(', ')}`);
                }
            });
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Valida che l'uscita sia dopo l'entrata
 * @param {string} entrataTime - Orario entrata
 * @param {string} uscitaTime - Orario uscita
 * @returns {{valid: boolean, error?: string}}
 */
export function validateTimeSequence(entrataTime, uscitaTime) {
    const entrata = parseTimeToMinutes(entrataTime);
    const uscita = parseTimeToMinutes(uscitaTime);

    if (entrata === null || uscita === null) {
        return { valid: false, error: 'Orari non validi' };
    }

    if (uscita <= entrata) {
        return { valid: false, error: 'L\'uscita deve essere successiva all\'entrata' };
    }

    return { valid: true };
}

/**
 * Converte un orario HH:MM in minuti totali
 * @param {string} time - Orario in formato HH:MM
 * @returns {number|null} Minuti totali o null se invalido
 */
export function parseTimeToMinutes(time) {
    const validation = validateTime(time);
    if (!validation.valid) return null;

    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Converte minuti totali in formato HH:MM
 * @param {number} totalMinutes - Minuti totali
 * @returns {string} Orario in formato HH:MM
 */
export function minutesToTime(totalMinutes) {
    const hours = Math.floor(Math.abs(totalMinutes) / 60);
    const minutes = Math.abs(totalMinutes) % 60;
    const sign = totalMinutes < 0 ? '-' : '';
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Sanitizza una stringa per prevenire XSS
 * @param {string} str - Stringa da sanitizzare
 * @returns {string} Stringa sanitizzata
 */
export function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

export default {
    VALID_ENTRY_TYPES,
    TIME_REQUIRED_TYPES,
    SPECIAL_TYPES,
    validateTime,
    normalizeTime,
    validateDate,
    validateEntryType,
    requiresTime,
    isSpecialType,
    validateEntry,
    validateWeekKey,
    validateImportData,
    validateTimeSequence,
    parseTimeToMinutes,
    minutesToTime,
    sanitizeString
};
