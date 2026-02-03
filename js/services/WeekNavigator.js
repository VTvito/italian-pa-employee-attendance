/**
 * WeekNavigator - Service per navigazione settimane
 * 
 * @description Gestisce la navigazione tra settimane, tracking della
 * settimana corrente e operazioni relative alla vista settimanale.
 */

import {
    getWeekNumber,
    getWeekYear,
    getWeekKey,
    getWorkWeekDates,
    formatDateISO,
    formatDateWithDay,
    getPreviousWeek,
    getNextWeek,
    isCurrentWeek,
    parseWeekKey,
    getWeekStartDate,
    isToday
} from '../utils/DateUtils.js';
import { eventBus, EVENTS } from '../utils/EventBus.js';

/**
 * Classe per navigazione settimane
 */
export class WeekNavigator {
    constructor() {
        this.reset();
    }

    /**
     * Resetta alla settimana corrente
     * Aggiorna anche currentYear/currentWeek alla data odierna
     */
    reset() {
        const today = new Date();
        this.currentYear = getWeekYear(today);
        this.currentWeek = getWeekNumber(today);
        this.viewYear = this.currentYear;
        this.viewWeek = this.currentWeek;
    }

    /**
     * Aggiorna la settimana corrente basandosi sulla data odierna.
     * Chiamare questo metodo quando l'app viene riaperta per assicurarsi
     * che la settimana corrente sia aggiornata.
     * @returns {boolean} true se la settimana corrente è cambiata
     */
    refreshCurrentWeek() {
        const today = new Date();
        const newYear = getWeekYear(today);
        const newWeek = getWeekNumber(today);
        
        const changed = (this.currentYear !== newYear || this.currentWeek !== newWeek);
        
        if (changed) {
            console.log(`WeekNavigator: Settimana aggiornata da ${this.currentYear}-W${this.currentWeek} a ${newYear}-W${newWeek}`);
            this.currentYear = newYear;
            this.currentWeek = newWeek;
            
            // Se stava visualizzando la settimana "corrente" precedente, aggiorna anche la vista
            // Altrimenti mantieni la settimana che l'utente stava visualizzando
        }
        
        return changed;
    }

    /**
     * Ottiene la chiave della settimana visualizzata
     * @returns {string}
     */
    getViewWeekKey() {
        return getWeekKey(this.viewYear, this.viewWeek);
    }

    /**
     * Ottiene la chiave della settimana corrente
     * @returns {string}
     */
    getCurrentWeekKey() {
        return getWeekKey(this.currentYear, this.currentWeek);
    }

    /**
     * Verifica se la vista è sulla settimana corrente
     * @returns {boolean}
     */
    isViewingCurrentWeek() {
        return this.viewYear === this.currentYear && this.viewWeek === this.currentWeek;
    }

    /**
     * Naviga alla settimana precedente
     * @returns {string} Nuova chiave settimana
     */
    goToPreviousWeek() {
        const prev = getPreviousWeek(this.viewYear, this.viewWeek);
        this.viewYear = prev.year;
        this.viewWeek = prev.week;
        
        const weekKey = this.getViewWeekKey();
        eventBus.emit(EVENTS.WEEK_CHANGED, { 
            weekKey, 
            year: this.viewYear, 
            week: this.viewWeek,
            isCurrent: this.isViewingCurrentWeek()
        });
        
        return weekKey;
    }

    /**
     * Naviga alla settimana successiva
     * @returns {string} Nuova chiave settimana
     */
    goToNextWeek() {
        const next = getNextWeek(this.viewYear, this.viewWeek);
        this.viewYear = next.year;
        this.viewWeek = next.week;
        
        const weekKey = this.getViewWeekKey();
        eventBus.emit(EVENTS.WEEK_CHANGED, { 
            weekKey, 
            year: this.viewYear, 
            week: this.viewWeek,
            isCurrent: this.isViewingCurrentWeek()
        });
        
        return weekKey;
    }

    /**
     * Naviga alla settimana corrente
     * @returns {string} Chiave settimana corrente
     */
    goToCurrentWeek() {
        this.viewYear = this.currentYear;
        this.viewWeek = this.currentWeek;
        
        const weekKey = this.getViewWeekKey();
        eventBus.emit(EVENTS.WEEK_CHANGED, { 
            weekKey, 
            year: this.viewYear, 
            week: this.viewWeek,
            isCurrent: true
        });
        
        return weekKey;
    }

    /**
     * Naviga a una settimana specifica
     * @param {number} year - Anno
     * @param {number} week - Numero settimana
     * @returns {string} Chiave settimana
     */
    goToWeek(year, week) {
        this.viewYear = year;
        this.viewWeek = week;
        
        const weekKey = this.getViewWeekKey();
        eventBus.emit(EVENTS.WEEK_CHANGED, { 
            weekKey, 
            year: this.viewYear, 
            week: this.viewWeek,
            isCurrent: this.isViewingCurrentWeek()
        });
        
        return weekKey;
    }

    /**
     * Naviga a una settimana tramite chiave
     * @param {string} weekKey - Chiave settimana (es. "2026-W05")
     * @returns {string} Chiave settimana
     */
    goToWeekKey(weekKey) {
        const { year, week } = parseWeekKey(weekKey);
        return this.goToWeek(year, week);
    }

    /**
     * Ottiene le date lavorative della settimana visualizzata
     * @returns {Date[]}
     */
    getViewWorkDates() {
        return getWorkWeekDates(this.viewYear, this.viewWeek);
    }

    /**
     * Ottiene informazioni sulla settimana visualizzata
     * @returns {Object}
     */
    getViewWeekInfo() {
        const dates = this.getViewWorkDates();
        const startDate = getWeekStartDate(this.viewYear, this.viewWeek);
        
        return {
            weekKey: this.getViewWeekKey(),
            year: this.viewYear,
            week: this.viewWeek,
            isCurrent: this.isViewingCurrentWeek(),
            startDate: startDate,
            days: dates.map(date => ({
                date: date,
                dateKey: formatDateISO(date),
                label: formatDateWithDay(date),
                isToday: isToday(date),
                dayOfWeek: date.getDay()
            }))
        };
    }

    /**
     * Ottiene l'etichetta della settimana per l'UI
     * @returns {string} Es: "Settimana 5"
     */
    getWeekLabel() {
        return `Settimana ${this.viewWeek}`;
    }

    /**
     * Ottiene l'etichetta dell'anno per l'UI
     * @returns {string}
     */
    getYearLabel() {
        return String(this.viewYear);
    }

    /**
     * Calcola la differenza in settimane dalla settimana corrente
     * @returns {number} Positivo = futuro, Negativo = passato
     */
    getWeekOffset() {
        // Calcola approssimativamente
        const viewStart = getWeekStartDate(this.viewYear, this.viewWeek);
        const currentStart = getWeekStartDate(this.currentYear, this.currentWeek);
        return Math.round((viewStart - currentStart) / (7 * 24 * 60 * 60 * 1000));
    }

    /**
     * Verifica se una data è nella settimana visualizzata
     * @param {string} dateKey - Data in formato ISO
     * @returns {boolean}
     */
    isInViewWeek(dateKey) {
        const dates = this.getViewWorkDates();
        return dates.some(d => formatDateISO(d) === dateKey);
    }

    /**
     * Ottiene la data corrente se è nella settimana visualizzata
     * @returns {string|null} dateKey o null
     */
    getTodayIfInView() {
        if (!this.isViewingCurrentWeek()) {
            return null;
        }
        const today = new Date();
        const dateKey = formatDateISO(today);
        return this.isInViewWeek(dateKey) ? dateKey : null;
    }
}

// Esporta istanza singleton
export const weekNavigator = new WeekNavigator();

export default WeekNavigator;
