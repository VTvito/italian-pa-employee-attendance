/**
 * TimeCalculator - Service per calcoli ore
 * 
 * @description Gestisce tutti i calcoli relativi alle ore lavorate:
 * ore giornaliere, pause automatiche, totali settimanali e saldi.
 */

import { parseTimeToMinutes, minutesToTime } from '../utils/Validators.js';
import { isFriday, parseDateISO } from '../utils/DateUtils.js';

/**
 * Configurazione ore e pause
 */
export const CONFIG = {
    WEEKLY_TARGET_HOURS: 36,           // Ore settimanali target
    WEEKLY_TARGET_MINUTES: 36 * 60,    // In minuti
    PAUSE_MINUTES: 30,                 // Pausa automatica (30 min) lun-gio
    PAUSE_THRESHOLD_HOURS: 6,          // Soglia per applicare pausa
    SMART_HOURS_DEFAULT: 7.5,          // Ore Smart lun-gio
    SMART_HOURS_FRIDAY: 6,             // Ore Smart venerdì
    DAILY_TARGET_HOURS: 7.5,           // Ore giornaliere target lun-gio (7h30m)
    FRIDAY_TARGET_HOURS: 6             // Ore target venerdì (6h, no pausa)
    // Verifica: 7.5 * 4 + 6 = 36h ✓
};

/**
 * Classe per calcoli temporali
 */
export class TimeCalculator {
    /**
     * Calcola le ore lavorate per un giorno
     * @param {Array} entries - Array di entry per il giorno
     * @param {string} dateKey - Data in formato ISO (per determinare venerdì)
     * @returns {{minutes: number, formatted: string, hasIncomplete: boolean}}
     */
    calculateDayHours(entries, dateKey) {
        if (!entries || entries.length === 0) {
            return { minutes: 0, formatted: '00:00', hasIncomplete: false };
        }

        // Verifica se è un giorno speciale (smart/assente)
        if (entries.length === 1) {
            const entry = entries[0];
            if (entry.type === 'smart' || entry.type === 'assente') {
                const hours = entry.hours || 0;
                const minutes = Math.round(hours * 60);
                return {
                    minutes,
                    formatted: minutesToTime(minutes),
                    hasIncomplete: false
                };
            }
        }

        // Calcola ore da coppie entrata/uscita
        const { workedMinutes, hasIncomplete, pairCount } = this.calculatePairMinutes(entries);

        // Applica pausa automatica SOLO se c'è una singola coppia.
        // Se ci sono 2+ coppie, la pausa è già reale (uscita/rientro) e non va detratta.
        const pauseMinutes = (pairCount <= 1 && this.shouldApplyPause(workedMinutes, dateKey))
            ? CONFIG.PAUSE_MINUTES : 0;
        const netMinutes = Math.max(0, workedMinutes - pauseMinutes);

        return {
            minutes: netMinutes,
            formatted: minutesToTime(netMinutes),
            hasIncomplete,
            grossMinutes: workedMinutes,
            pauseApplied: pauseMinutes > 0
        };
    }

    /**
     * Calcola i minuti da coppie entrata/uscita
     * @param {Array} entries - Array di entry
     * @returns {{workedMinutes: number, hasIncomplete: boolean, pairCount: number}}
     */
    calculatePairMinutes(entries) {
        let workedMinutes = 0;
        let hasIncomplete = false;

        // Separa entrate e uscite
        const entrate = entries.filter(e => e.type === 'entrata').map(e => e.time);
        const uscite = entries.filter(e => e.type === 'uscita').map(e => e.time);

        // Verifica se ci sono entrate non accoppiate
        if (entrate.length > uscite.length) {
            hasIncomplete = true;
        }

        // Calcola per ogni coppia
        const pairs = Math.min(entrate.length, uscite.length);
        for (let i = 0; i < pairs; i++) {
            const entrataMinutes = parseTimeToMinutes(entrate[i]);
            const uscitaMinutes = parseTimeToMinutes(uscite[i]);

            if (entrataMinutes !== null && uscitaMinutes !== null) {
                const diff = uscitaMinutes - entrataMinutes;
                if (diff > 0) {
                    workedMinutes += diff;
                }
            }
        }

        return { workedMinutes, hasIncomplete, pairCount: pairs };
    }

    /**
     * Determina se applicare la pausa automatica
     * @param {number} workedMinutes - Minuti lavorati
     * @param {string} dateKey - Data in formato ISO
     * @returns {boolean}
     */
    shouldApplyPause(workedMinutes, dateKey) {
        // Nessuna pausa il venerdì
        if (isFriday(parseDateISO(dateKey))) {
            return false;
        }

        // Pausa solo se ore > 6
        const workedHours = workedMinutes / 60;
        return workedHours > CONFIG.PAUSE_THRESHOLD_HOURS;
    }

    /**
     * Calcola il totale settimanale
     * @param {Object} weekEntries - Oggetto {dateKey: [entries]}
     * @returns {{minutes: number, formatted: string, byDay: Object}}
     */
    calculateWeekTotal(weekEntries) {
        let totalMinutes = 0;
        const byDay = {};

        for (const [dateKey, entries] of Object.entries(weekEntries)) {
            const dayResult = this.calculateDayHours(entries, dateKey);
            byDay[dateKey] = dayResult;
            totalMinutes += dayResult.minutes;
        }

        return {
            minutes: totalMinutes,
            formatted: minutesToTime(totalMinutes),
            byDay
        };
    }

    /**
     * Calcola il saldo settimanale rispetto al target
     * @param {number} workedMinutes - Minuti lavorati
     * @returns {{minutes: number, formatted: string, isPositive: boolean, isNeutral: boolean}}
     */
    calculateBalance(workedMinutes) {
        const balanceMinutes = workedMinutes - CONFIG.WEEKLY_TARGET_MINUTES;
        const sign = balanceMinutes >= 0 ? '+' : '';
        
        return {
            minutes: balanceMinutes,
            formatted: `${sign}${minutesToTime(balanceMinutes)}`,
            isPositive: balanceMinutes > 0,
            isNegative: balanceMinutes < 0,
            isNeutral: balanceMinutes === 0
        };
    }

    /**
     * Formatta le ore in formato leggibile
     * @param {number} minutes - Minuti totali
     * @returns {string} Formato "Xh Ym" o "HH:MM"
     */
    formatHoursReadable(minutes) {
        const hours = Math.floor(Math.abs(minutes) / 60);
        const mins = Math.abs(minutes) % 60;
        const sign = minutes < 0 ? '-' : '';
        
        if (mins === 0) {
            return `${sign}${hours}h`;
        }
        return `${sign}${hours}h ${mins}m`;
    }

    /**
     * Converte ore decimali in minuti
     * @param {number} hours - Ore in formato decimale
     * @returns {number} Minuti
     */
    hoursToMinutes(hours) {
        return Math.round(hours * 60);
    }

    /**
     * Converte minuti in ore decimali
     * @param {number} minutes - Minuti
     * @returns {number} Ore decimali
     */
    minutesToHours(minutes) {
        return Math.round((minutes / 60) * 100) / 100;
    }

    /**
     * Calcola le ore rimanenti per raggiungere il target settimanale
     * @param {number} workedMinutes - Minuti già lavorati
     * @returns {{minutes: number, formatted: string}}
     */
    calculateRemaining(workedMinutes) {
        const remaining = Math.max(0, CONFIG.WEEKLY_TARGET_MINUTES - workedMinutes);
        return {
            minutes: remaining,
            formatted: minutesToTime(remaining)
        };
    }

    /**
     * Stima l'ora di uscita per raggiungere un target giornaliero
     * @param {string} entrataTime - Ora di entrata (HH:MM)
     * @param {number} targetHours - Ore target
     * @param {boolean} includePause - Se includere la pausa
     * @returns {string} Ora di uscita stimata
     */
    estimateExitTime(entrataTime, targetHours, includePause = true) {
        const entrataMinutes = parseTimeToMinutes(entrataTime);
        if (entrataMinutes === null) {
            return '--:--';
        }

        let targetMinutes = this.hoursToMinutes(targetHours);
        if (includePause && targetHours > CONFIG.PAUSE_THRESHOLD_HOURS) {
            targetMinutes += CONFIG.PAUSE_MINUTES;
        }

        const exitMinutes = entrataMinutes + targetMinutes;
        return minutesToTime(exitMinutes);
    }

    /**
     * Ottiene le ore Smart Working per un giorno
     * @param {string} dateKey - Data in formato ISO
     * @returns {number} Ore Smart
     */
    getSmartHours(dateKey) {
        return isFriday(parseDateISO(dateKey)) 
            ? CONFIG.SMART_HOURS_FRIDAY 
            : CONFIG.SMART_HOURS_DEFAULT;
    }

    /**
     * Ottiene le ore target per un giorno
     * @param {string} dateKey - Data in formato ISO
     * @returns {number} Ore target
     */
    getDailyTarget(dateKey) {
        return isFriday(parseDateISO(dateKey))
            ? CONFIG.FRIDAY_TARGET_HOURS
            : CONFIG.DAILY_TARGET_HOURS;
    }

    /**
     * Calcola il delta giornaliero (minuti extra/deficit rispetto al target)
     * @param {Array} entries - Array di entry per il giorno
     * @param {string} dateKey - Data in formato ISO
     * @returns {{minutes: number, formatted: string, isPositive: boolean, isNegative: boolean, isNeutral: boolean, hasIncomplete: boolean}|null}
     */
    calculateDayDelta(entries, dateKey) {
        if (!entries || entries.length === 0) {
            return null; // Nessuna entry, nessun delta
        }

        // Non mostrare delta per giorni assente
        if (entries.length === 1 && entries[0].type === 'assente') {
            return null;
        }

        const dayHours = this.calculateDayHours(entries, dateKey);
        const targetMinutes = this.hoursToMinutes(this.getDailyTarget(dateKey));
        const deltaMinutes = dayHours.minutes - targetMinutes;

        return {
            minutes: deltaMinutes,
            formatted: this.formatDeltaMinutes(deltaMinutes),
            isPositive: deltaMinutes > 0,
            isNegative: deltaMinutes < 0,
            isNeutral: deltaMinutes === 0,
            hasIncomplete: dayHours.hasIncomplete
        };
    }

    /**
     * Formatta i minuti delta in formato leggibile (+1h 30m, -15m, ecc.)
     * @param {number} minutes - Minuti delta (positivi o negativi)
     * @returns {string}
     */
    formatDeltaMinutes(minutes) {
        const sign = minutes >= 0 ? '+' : '-';
        const absMinutes = Math.abs(minutes);
        const hours = Math.floor(absMinutes / 60);
        const mins = absMinutes % 60;

        if (hours === 0) {
            return `${sign}${mins}min`;
        }
        if (mins === 0) {
            return `${sign}${hours}h`;
        }
        return `${sign}${hours}h ${mins}m`;
    }
}

// Esporta istanza singleton
export const timeCalculator = new TimeCalculator();

export default TimeCalculator;
