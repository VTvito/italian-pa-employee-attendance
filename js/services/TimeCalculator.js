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
    PAUSE_MINUTES: 30,                 // Pausa automatica massima
    PAUSE_THRESHOLD_HOURS: 6,          // Soglia per applicare pausa
    SMART_HOURS_DEFAULT: 7.5,          // Ore Smart lun-gio
    SMART_HOURS_FRIDAY: 6,             // Ore Smart venerdì
    DAILY_TARGET_HOURS: 7.5,           // Ore giornaliere target lun-gio (7h30m)
    FRIDAY_TARGET_HOURS: 6             // Ore target venerdì
    // Verifica: 7.5 * 4 + 6 = 36h ✓
};

/**
 * Classe per calcoli temporali
 */
export class TimeCalculator {
    /**
     * Verifica se un array di entry rappresenta un giorno speciale completo
     * @param {Array} entries - Array di entry del giorno
     * @returns {boolean}
     */
    isSpecialDayEntries(entries) {
        return Array.isArray(entries)
            && entries.length === 1
            && (entries[0].type === 'smart' || entries[0].type === 'assente');
    }

    /**
     * Restituisce le ore fisse per un giorno speciale in base alla data
     * @param {string} type - Tipo speciale
     * @param {string} dateKey - Data in formato ISO
     * @returns {number}
     */
    getSpecialDayHours(type, dateKey) {
        return type === 'smart'
            ? this.getSmartHours(dateKey)
            : this.getDailyTarget(dateKey);
    }

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
        if (this.isSpecialDayEntries(entries)) {
            const entry = entries[0];
            const hours = this.getSpecialDayHours(entry.type, dateKey);
            const minutes = Math.round(hours * 60);

            return {
                minutes,
                formatted: minutesToTime(minutes),
                hasIncomplete: false
            };
        }

        // Calcola ore da coppie entrata/uscita
        const { workedMinutes, hasIncomplete, pairCount, breakMinutes } = this.calculatePairMinutes(entries);

        const requiredPauseMinutes = this.getRequiredPauseMinutes(workedMinutes, dateKey, pairCount, breakMinutes);
        const netMinutes = Math.max(0, workedMinutes - requiredPauseMinutes);

        return {
            minutes: netMinutes,
            formatted: minutesToTime(netMinutes),
            hasIncomplete,
            grossMinutes: workedMinutes,
            pauseApplied: requiredPauseMinutes > 0,
            breakMinutes: pairCount > 1 ? breakMinutes : requiredPauseMinutes
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
        let breakMinutes = 0;

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

            // Calcola pausa tra coppie consecutive (gap tra uscita[i] e entrata[i+1])
            if (i < pairs - 1) {
                const exitMin = parseTimeToMinutes(uscite[i]);
                const nextEntryMin = parseTimeToMinutes(entrate[i + 1]);
                if (exitMin !== null && nextEntryMin !== null && nextEntryMin > exitMin) {
                    breakMinutes += (nextEntryMin - exitMin);
                }
            }
        }

        return { workedMinutes, hasIncomplete, pairCount: pairs, breakMinutes };
    }

    /**
     * Calcola la pausa totale richiesta in base al giorno e alle ore lorde
     * @param {number} workedMinutes - Minuti lavorati
     * @param {string} dateKey - Data in formato ISO
     * @param {number} pairCount - Numero di coppie entrata/uscita complete
     * @param {number} breakMinutes - Minuti di pausa reale tra coppie
     * @returns {number}
     */
    getRequiredPauseMinutes(workedMinutes, dateKey, pairCount = 1, breakMinutes = 0) {
        if (workedMinutes <= 0) {
            return 0;
        }

        const minimumPauseMinutes = this.getMinimumPauseMinutes(workedMinutes, dateKey);
        if (minimumPauseMinutes === 0) {
            return 0;
        }

        if (pairCount <= 1) {
            return minimumPauseMinutes;
        }

        return Math.max(0, minimumPauseMinutes - breakMinutes);
    }

    /**
     * Restituisce la pausa minima richiesta per il giorno
     * @param {number} workedMinutes - Minuti lavorati lordi
     * @param {string} dateKey - Data in formato ISO
     * @returns {number}
     */
    getMinimumPauseMinutes(workedMinutes, dateKey) {
        if (workedMinutes <= 0) {
            return 0;
        }

        if (isFriday(parseDateISO(dateKey))) {
            const pauseThresholdMinutes = this.hoursToMinutes(CONFIG.PAUSE_THRESHOLD_HOURS);
            return workedMinutes > pauseThresholdMinutes ? CONFIG.PAUSE_MINUTES : 0;
        }

        return CONFIG.PAUSE_MINUTES;
    }

    /**
     * Determina se applicare la pausa automatica
     * @param {number} workedMinutes - Minuti lavorati
     * @param {string} dateKey - Data in formato ISO
     * @returns {boolean}
     */
    shouldApplyPause(workedMinutes, dateKey) {
        return this.getMinimumPauseMinutes(workedMinutes, dateKey) > 0;
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
        if (includePause) {
            targetMinutes += this.getRequiredPauseMinutes(targetMinutes, '1970-01-05');
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

    /**
     * Analizza lo stato di un giorno con timbrature aperte o sbilanciate
     * @param {Array} entries - Array di entry del giorno
     * @returns {{
     *   hasEntrata: boolean,
     *   hasUscita: boolean,
     *   hasOpenSession: boolean,
     *   hasUnpairedExit: boolean,
     *   isComplete: boolean,
     *   completedWorkedMinutes: number,
     *   breakMinutes: number,
     *   completePairCount: number,
     *   finalPairCount: number,
     *   openEntryMinutes: number|null,
     *   unpairedExitMinutes: number|null,
     *   lastPairedExitMinutes: number|null
     * }}
     */
    getOpenDayState(entries) {
        const entrate = entries.filter((entry) => entry.type === 'entrata').map((entry) => entry.time);
        const uscite = entries.filter((entry) => entry.type === 'uscita').map((entry) => entry.time);

        const completePairs = Math.min(entrate.length, uscite.length);
        let completedWorkedMinutes = 0;
        let breakMinutes = 0;

        for (let index = 0; index < completePairs; index++) {
            const entrataMinutes = parseTimeToMinutes(entrate[index]);
            const uscitaMinutes = parseTimeToMinutes(uscite[index]);

            if (entrataMinutes !== null && uscitaMinutes !== null && uscitaMinutes > entrataMinutes) {
                completedWorkedMinutes += uscitaMinutes - entrataMinutes;
            }

            if (index < completePairs - 1) {
                const exitMinutes = parseTimeToMinutes(uscite[index]);
                const nextEntryMinutes = parseTimeToMinutes(entrate[index + 1]);
                if (exitMinutes !== null && nextEntryMinutes !== null && nextEntryMinutes > exitMinutes) {
                    breakMinutes += nextEntryMinutes - exitMinutes;
                }
            }
        }

        const hasOpenSession = entrate.length > uscite.length;
        const hasUnpairedExit = uscite.length > entrate.length;
        const openEntryIndex = uscite.length;
        const openEntryMinutes = hasOpenSession
            ? parseTimeToMinutes(entrate[openEntryIndex])
            : null;
        const unpairedExitIndex = entrate.length;
        const unpairedExitMinutes = hasUnpairedExit
            ? parseTimeToMinutes(uscite[unpairedExitIndex])
            : null;
        const lastPairedExitMinutes = completePairs > 0
            ? parseTimeToMinutes(uscite[completePairs - 1])
            : null;

        if (hasOpenSession && completePairs > 0) {
            if (
                lastPairedExitMinutes !== null
                && openEntryMinutes !== null
                && openEntryMinutes > lastPairedExitMinutes
            ) {
                breakMinutes += openEntryMinutes - lastPairedExitMinutes;
            }
        }

        return {
            hasEntrata: entrate.length > 0,
            hasUscita: uscite.length > 0,
            hasOpenSession,
            hasUnpairedExit,
            isComplete: entrate.length > 0 && entrate.length === uscite.length,
            completedWorkedMinutes,
            breakMinutes,
            completePairCount: completePairs,
            finalPairCount: completePairs + ((hasOpenSession || hasUnpairedExit) ? 1 : 0),
            openEntryMinutes,
            unpairedExitMinutes,
            lastPairedExitMinutes
        };
    }

    /**
     * Calcola i minuti netti risultanti aggiungendo una coppia suggerita
     * @param {Object} state - Stato del giorno
     * @param {string} dateKey - Data in formato ISO
     * @param {number} entryMinutes - Minuti entrata
     * @param {number} exitMinutes - Minuti uscita
     * @returns {number|null}
     */
    calculateSuggestedPairNetMinutes(state, dateKey, entryMinutes, exitMinutes) {
        if (entryMinutes === null || exitMinutes === null || exitMinutes <= entryMinutes) {
            return null;
        }

        if (
            state.lastPairedExitMinutes !== null
            && entryMinutes < state.lastPairedExitMinutes
        ) {
            return null;
        }

        const pairWorkedMinutes = exitMinutes - entryMinutes;
        const extraBreakMinutes = state.hasUnpairedExit && state.lastPairedExitMinutes !== null
            ? Math.max(0, entryMinutes - state.lastPairedExitMinutes)
            : 0;
        const totalWorkedMinutes = state.completedWorkedMinutes + pairWorkedMinutes;
        const totalBreakMinutes = state.breakMinutes + extraBreakMinutes;
        const requiredPauseMinutes = this.getRequiredPauseMinutes(
            totalWorkedMinutes,
            dateKey,
            state.finalPairCount,
            totalBreakMinutes
        );

        return Math.max(0, totalWorkedMinutes - requiredPauseMinutes);
    }

    /**
     * Stima l'orario di uscita per un giorno già iniziato e ancora aperto
     * @param {Array} entries - Array di entry del giorno
     * @param {string} dateKey - Data in formato ISO
     * @param {number} targetNetMinutes - Minuti netti necessari nel giorno
     * @returns {string|null}
     */
    estimateOpenDayExitTime(entries, dateKey, targetNetMinutes) {
        const state = this.getOpenDayState(entries);
        if (!state.hasOpenSession || state.openEntryMinutes === null) {
            return null;
        }

        for (let exitMinutes = state.openEntryMinutes + 1; exitMinutes <= 1439; exitMinutes++) {
            const netMinutes = this.calculateSuggestedPairNetMinutes(
                state,
                dateKey,
                state.openEntryMinutes,
                exitMinutes
            );

            if (netMinutes === targetNetMinutes) {
                return minutesToTime(exitMinutes);
            }
        }

        return null;
    }

    /**
     * Stima l'orario di ingresso quando e' gia stata inserita l'uscita finale
     * @param {Array} entries - Array di entry del giorno
     * @param {string} dateKey - Data in formato ISO
     * @param {number} targetNetMinutes - Minuti netti necessari nel giorno
     * @returns {string|null}
     */
    estimateOpenDayEntryTime(entries, dateKey, targetNetMinutes) {
        const state = this.getOpenDayState(entries);
        if (!state.hasUnpairedExit || state.unpairedExitMinutes === null) {
            return null;
        }

        const firstCandidateMinutes = state.lastPairedExitMinutes !== null
            ? state.lastPairedExitMinutes
            : 0;

        for (let entryMinutes = state.unpairedExitMinutes - 1; entryMinutes >= firstCandidateMinutes; entryMinutes--) {
            const netMinutes = this.calculateSuggestedPairNetMinutes(
                state,
                dateKey,
                entryMinutes,
                state.unpairedExitMinutes
            );

            if (netMinutes === targetNetMinutes) {
                return minutesToTime(entryMinutes);
            }
        }

        return null;
    }

    /**
     * Calcola il suggerimento di uscita per l'ultimo giorno utile in presenza,
     * considerando smart/assenze future come giornate già coperte.
     * @param {Object} weekEntries - Oggetto {dateKey: [entries]}
     * @param {string[]} [workDateKeys=[]] - Giorni lavorativi ordinabili della settimana
     * @returns {{
     *   exitTime: string|null,
    *   entryTime: string|null,
    *   recordedExitTime: string|null,
     *   targetDayMinutes: number,
     *   targetDateKey: string,
     *   hasEntrata: boolean,
    *   hasUscita: boolean,
     *   hasOpenSession: boolean,
    *   hasUnpairedExit: boolean,
     *   hasCompleteDay: boolean,
     *   isFridayTarget: boolean
     * }|null}
     */
    calculateFridayExitSuggestion(weekEntries, workDateKeys = []) {
        const sortedDates = (workDateKeys.length > 0 ? workDateKeys : Object.keys(weekEntries)).slice().sort();
        if (sortedDates.length === 0) {
            return null;
        }

        const targetDateKey = [...sortedDates].reverse().find((dateKey) => {
            const entries = weekEntries[dateKey] || [];
            return !this.isSpecialDayEntries(entries);
        });

        if (!targetDateKey) {
            return null;
        }

        let plannedMinutes = 0;
        for (const dateKey of sortedDates) {
            if (dateKey === targetDateKey) {
                continue;
            }

            const entries = weekEntries[dateKey] || [];
            if (entries.length === 0) {
                continue;
            }

            const dayResult = this.calculateDayHours(entries, dateKey);
            if (!dayResult.hasIncomplete) {
                plannedMinutes += dayResult.minutes;
            }
        }

        const targetEntries = weekEntries[targetDateKey] || [];
        const targetDayState = this.getOpenDayState(targetEntries);
        if (targetDayState.isComplete) {
            return null;
        }

        const targetDayMinutes = Math.max(0, CONFIG.WEEKLY_TARGET_MINUTES - plannedMinutes);
        const exitTime = targetDayState.hasOpenSession
            ? this.estimateOpenDayExitTime(targetEntries, targetDateKey, targetDayMinutes)
            : null;
        const entryTime = targetDayState.hasUnpairedExit
            ? this.estimateOpenDayEntryTime(targetEntries, targetDateKey, targetDayMinutes)
            : null;
        const recordedExitTime = targetDayState.unpairedExitMinutes !== null
            ? minutesToTime(targetDayState.unpairedExitMinutes)
            : null;

        return {
            exitTime,
            entryTime,
            recordedExitTime,
            targetDayMinutes,
            targetDateKey,
            hasEntrata: targetDayState.hasEntrata,
            hasUscita: targetDayState.hasUscita,
            hasOpenSession: targetDayState.hasOpenSession,
            hasUnpairedExit: targetDayState.hasUnpairedExit,
            hasCompleteDay: targetDayState.isComplete,
            isFridayTarget: isFriday(parseDateISO(targetDateKey))
        };
    }
}

// Esporta istanza singleton
export const timeCalculator = new TimeCalculator();

export default TimeCalculator;
