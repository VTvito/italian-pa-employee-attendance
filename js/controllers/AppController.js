/**
 * AppController - Controller principale dell'applicazione
 * 
 * @description Orchestrazione della logica applicativa, coordinamento tra
 * Model, View e Services. Gestisce il flusso dati e le azioni utente.
 */

import { WeekData } from '../models/WeekData.js';
import { TimeEntry, ABSENT_HOURS } from '../models/TimeEntry.js';
import { StorageManager } from '../storage/StorageManager.js';
import { UIManager } from '../views/UIManager.js';
import { ModalManager, modalManager } from '../views/ModalManager.js';
import { WeekNavigator, weekNavigator } from '../services/WeekNavigator.js';
import { timeCalculator, CONFIG } from '../services/TimeCalculator.js';
import { exportService } from '../services/ExportService.js';
import { eventBus, EVENTS } from '../utils/EventBus.js';
import { formatDateISO, isFriday, parseDateISO, getCurrentWeek, getWeekKey, getWeekYear, getWeekNumber } from '../utils/DateUtils.js';

/**
 * Controller principale
 */
export class AppController {
    constructor() {
        /** @type {StorageManager} */
        this.storage = new StorageManager();
        
        /** @type {WeekNavigator} */
        this.navigator = weekNavigator;
        
        /** @type {Object} Tutti i dati caricati */
        this.allData = {};
        
        /** @type {WeekData|null} Dati settimana corrente in visualizzazione */
        this.currentWeekData = null;
        
        /** @type {UIManager} */
        this.ui = null;
        
        /** @type {boolean} */
        this.isInitialized = false;
    }

    /**
     * Inizializza l'applicazione
     */
    async init() {
        try {
            console.log('AppController: Inizializzazione...');

            // Inizializza storage
            await this.storage.init();

            // Carica tutti i dati
            this.allData = await this.storage.loadAllData();
            console.log(`AppController: Caricati dati per ${Object.keys(this.allData).length} settimane`);

            // Inizializza UI con callbacks
            this.ui = new UIManager({
                onEntrata: () => this.handleEntrata(),
                onUscita: () => this.handleUscita(),
                onSmart: () => this.handleSmart(),
                onAssente: () => this.handleAssente(),
                onPrevWeek: () => this.handlePrevWeek(),
                onNextWeek: () => this.handleNextWeek(),
                onEditEntry: (date, index, entry) => this.handleEditEntry(date, index, entry),
                onAddEntry: (dateKey) => this.handleAddEntry(dateKey),
                onExportJSON: () => this.handleExportJSON(),
                onExportExcel: () => this.handleExportExcel(),
                onImport: (file) => this.handleImport(file),
                onBackup: () => this.handleBackup()
            });

            // Setup event listeners
            this.setupEventListeners();

            // Carica e visualizza settimana corrente
            await this.loadCurrentWeek();

            // Controlla dati vecchi
            await this.checkOldData();
            
            // Setup listener per aggiornamento settimana quando l'app torna in focus
            this.setupVisibilityListener();

            this.isInitialized = true;
            eventBus.emit(EVENTS.APP_INITIALIZED);
            console.log('AppController: Inizializzazione completata');

        } catch (error) {
            console.error('AppController: Errore inizializzazione:', error);
            eventBus.emit(EVENTS.APP_ERROR, { message: 'Errore inizializzazione', error });
        }
    }
    
    /**
     * Setup listener per quando l'app torna visibile (es. da background)
     * Utile per aggiornare la settimana corrente se è passata la mezzanotte
     */
    setupVisibilityListener() {
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible' && this.isInitialized) {
                // Aggiorna la settimana corrente
                const weekChanged = this.navigator.refreshCurrentWeek();
                
                if (weekChanged) {
                    // Se siamo in una nuova settimana, naviga automaticamente ad essa
                    console.log('AppController: Nuova settimana rilevata, aggiornamento vista...');
                    await this.loadCurrentWeek();
                    this.ui.showToast('📅 Nuova settimana iniziata!', 'info');
                }
            }
        });
    }

    /**
     * Setup event listeners globali
     */
    setupEventListeners() {
        // Week changed
        eventBus.on(EVENTS.WEEK_CHANGED, async (data) => {
            await this.loadWeekData(data.weekKey);
        });
    }

    /**
     * Carica la settimana corrente
     */
    async loadCurrentWeek() {
        const weekKey = this.navigator.getCurrentWeekKey();
        await this.loadWeekData(weekKey);
    }

    /**
     * Carica i dati di una settimana e aggiorna la UI
     * @param {string} weekKey - Chiave settimana
     */
    async loadWeekData(weekKey) {
        const weekInfo = this.navigator.getViewWeekInfo();
        const weekData = this.allData[weekKey] || {};
        
        // Crea/aggiorna WeekData
        this.currentWeekData = WeekData.fromWeekKey(weekKey, weekData);
        
        // Aggiorna UI
        this.ui.renderWeek(weekInfo, this.currentWeekData.toJSON());
        
        eventBus.emit(EVENTS.WEEK_DATA_LOADED, { weekKey, weekInfo });
    }

    /**
     * Salva i dati della settimana corrente
     */
    async saveCurrentWeek() {
        if (!this.currentWeekData) return;

        const weekKey = this.currentWeekData.weekKey;
        const data = this.currentWeekData.toJSON();

        // Aggiorna dati locali
        if (Object.keys(data).length > 0) {
            this.allData[weekKey] = data;
        } else {
            delete this.allData[weekKey];
        }

        // Salva su storage
        await this.storage.saveAllData(this.allData);

        // Aggiorna UI
        const weekInfo = this.navigator.getViewWeekInfo();
        this.ui.renderWeek(weekInfo, data);
    }

    /**
     * Ottiene la data corrente in formato ISO
     * @returns {string}
     */
    getTodayDateKey() {
        return formatDateISO(new Date());
    }

    /**
     * Ottiene l'ora corrente in formato HH:MM
     * @returns {string}
     */
    getCurrentTime() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * Gestisce click su Entrata
     */
    async handleEntrata() {
        // Vai alla settimana corrente se non ci siamo già
        if (!this.navigator.isViewingCurrentWeek()) {
            this.navigator.goToCurrentWeek();
            await this.loadWeekData(this.navigator.getViewWeekKey());
        }

        const dateKey = this.getTodayDateKey();
        const time = this.getCurrentTime();

        // Verifica se è un giorno lavorativo
        const dayOfWeek = new Date().getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            this.ui.showToast('Non puoi registrare entrate nel weekend', 'warning');
            return;
        }

        // Verifica se il giorno ha già un tipo speciale
        if (this.currentWeekData.isSpecialDay(dateKey)) {
            const confirm = await modalManager.openConfirmModal(
                'Il giorno ha già una registrazione Smart/Assente. Vuoi sostituirla?',
                'Conferma sostituzione'
            );
            if (!confirm) return;
            this.currentWeekData.clearDay(dateKey);
        }

        // Aggiungi entry
        const entry = TimeEntry.createEntrata(time);
        this.currentWeekData.addEntry(dateKey, entry);

        await this.saveCurrentWeek();
        this.ui.showToast(`Entrata registrata: ${time}`, 'success');
    }

    /**
     * Gestisce click su Uscita
     */
    async handleUscita() {
        // Vai alla settimana corrente se non ci siamo già
        if (!this.navigator.isViewingCurrentWeek()) {
            this.navigator.goToCurrentWeek();
            await this.loadWeekData(this.navigator.getViewWeekKey());
        }

        const dateKey = this.getTodayDateKey();
        const time = this.getCurrentTime();

        // Verifica se è un giorno lavorativo
        const dayOfWeek = new Date().getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            this.ui.showToast('Non puoi registrare uscite nel weekend', 'warning');
            return;
        }

        // Verifica se il giorno ha già un tipo speciale
        if (this.currentWeekData.isSpecialDay(dateKey)) {
            this.ui.showToast('Il giorno ha una registrazione Smart/Assente', 'warning');
            return;
        }

        // Verifica se c'è un'entrata senza uscita
        const entries = this.currentWeekData.getEntriesForDate(dateKey);
        const entrate = entries.filter(e => e.type === 'entrata');
        const uscite = entries.filter(e => e.type === 'uscita');

        if (entrate.length === 0) {
            this.ui.showToast('Devi prima registrare un\'entrata', 'warning');
            return;
        }

        if (entrate.length === uscite.length) {
            this.ui.showToast('Tutte le entrate hanno già un\'uscita. Registra prima una nuova entrata.', 'warning');
            return;
        }

        // Aggiungi entry
        const entry = TimeEntry.createUscita(time);
        this.currentWeekData.addEntry(dateKey, entry);

        await this.saveCurrentWeek();
        
        // Calcola e mostra ore lavorate
        const dayHours = timeCalculator.calculateDayHours(
            this.currentWeekData.getEntriesForDate(dateKey).map(e => e.toJSON ? e.toJSON() : e),
            dateKey
        );
        this.ui.showToast(`Uscita registrata: ${time} (Ore: ${dayHours.formatted})`, 'success');
    }

    /**
     * Gestisce click su Smart Working
     */
    async handleSmart() {
        // Vai alla settimana corrente se non ci siamo già
        if (!this.navigator.isViewingCurrentWeek()) {
            this.navigator.goToCurrentWeek();
            await this.loadWeekData(this.navigator.getViewWeekKey());
        }

        const dateKey = this.getTodayDateKey();
        const date = parseDateISO(dateKey);
        
        // Verifica se è un giorno lavorativo
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            this.ui.showToast('Non puoi registrare Smart Working nel weekend', 'warning');
            return;
        }

        // Verifica se ci sono già entry
        if (this.currentWeekData.hasEntries(dateKey)) {
            const confirm = await modalManager.openConfirmModal(
                'Il giorno ha già delle registrazioni. Vuoi sostituirle con Smart Working?',
                'Conferma sostituzione'
            );
            if (!confirm) return;
        }

        // Aggiungi entry smart (gestisce automaticamente le ore in base al giorno)
        const entry = TimeEntry.createSmart(isFriday(date));
        this.currentWeekData.addEntry(dateKey, entry);

        await this.saveCurrentWeek();
        this.ui.showToast(`Smart Working registrato: ${entry.hours}h`, 'success');
    }

    /**
     * Gestisce click su Assente
     */
    async handleAssente() {
        // Vai alla settimana corrente se non ci siamo già
        if (!this.navigator.isViewingCurrentWeek()) {
            this.navigator.goToCurrentWeek();
            await this.loadWeekData(this.navigator.getViewWeekKey());
        }

        const dateKey = this.getTodayDateKey();
        
        // Verifica se è un giorno lavorativo
        const dayOfWeek = new Date().getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            this.ui.showToast('Non puoi registrare assenze nel weekend', 'warning');
            return;
        }

        // Verifica se ci sono già entry
        if (this.currentWeekData.hasEntries(dateKey)) {
            const confirm = await modalManager.openConfirmModal(
                'Il giorno ha già delle registrazioni. Vuoi sostituirle con Assente?',
                'Conferma sostituzione'
            );
            if (!confirm) return;
        }

        // Aggiungi entry assente (con ore corrette in base al giorno)
        const date = parseDateISO(dateKey);
        const entry = TimeEntry.createAssente(isFriday(date));
        this.currentWeekData.addEntry(dateKey, entry);

        await this.saveCurrentWeek();
        this.ui.showToast(`Assenza registrata (${entry.hours}h)`, 'success');
    }

    /**
     * Gestisce navigazione settimana precedente
     */
    async handlePrevWeek() {
        const weekKey = this.navigator.goToPreviousWeek();
        // L'evento WEEK_CHANGED trigghera il caricamento
    }

    /**
     * Gestisce navigazione settimana successiva
     */
    async handleNextWeek() {
        const weekKey = this.navigator.goToNextWeek();
        // L'evento WEEK_CHANGED trigghera il caricamento
    }

    /**
     * Gestisce modifica entry
     * @param {string} dateKey - Data ISO
     * @param {number} index - Indice entry
     * @param {Object} entry - Entry da modificare
     */
    async handleEditEntry(dateKey, index, entry) {
        const result = await modalManager.openEditModal({
            date: dateKey,
            index: index,
            entry: entry
        });

        if (!result) return;

        if (result.action === 'delete') {
            // Elimina entry
            const confirm = await modalManager.openConfirmModal(
                'Sei sicuro di voler eliminare questa registrazione?',
                'Conferma eliminazione'
            );
            
            if (confirm) {
                this.currentWeekData.deleteEntry(result.date, result.index);
                await this.saveCurrentWeek();
                this.ui.showToast('Registrazione eliminata', 'success');
            }
        } else if (result.action === 'save') {
            // Aggiorna entry
            const updates = {
                type: result.type,
                time: result.time
            };

            // Se cambia tipo a special, gestisci le ore
            if (result.type === 'smart') {
                updates.hours = timeCalculator.getSmartHours(result.date);
            } else if (result.type === 'assente') {
                updates.hours = isFriday(parseDateISO(result.date))
                    ? ABSENT_HOURS.FRIDAY : ABSENT_HOURS.DEFAULT;
            }

            this.currentWeekData.updateEntry(result.date, result.index, updates);
            await this.saveCurrentWeek();
            this.ui.showToast('Registrazione aggiornata', 'success');
        }
    }

    /**
     * Gestisce aggiunta nuova entry
     * @param {string} [dateKey] - Data preselezionata (opzionale)
     */
    async handleAddEntry(dateKey = null) {
        const result = await modalManager.openAddEntryModal({
            date: dateKey,
            type: 'entrata'
        });

        if (!result || result.action !== 'add') return;

        // Verifica se la data è nel weekend
        const selectedDate = parseDateISO(result.date);
        const dayOfWeek = selectedDate.getDay();
        
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            this.ui.showToast('Non puoi registrare nel weekend', 'warning');
            return;
        }

        // Determina la settimana della data selezionata
        const selectedWeekKey = getWeekKey(
            getWeekYear(selectedDate),
            getWeekNumber(selectedDate)
        );
        const viewWeekKey = this.navigator.getViewWeekKey();

        // Se la data è in una settimana diversa, naviga a quella settimana
        if (selectedWeekKey !== viewWeekKey) {
            this.navigator.goToWeekKey(selectedWeekKey);
            await this.loadWeekData(selectedWeekKey);
        }

        // Crea l'entry appropriata
        let entry;
        if (result.type === 'smart') {
            entry = TimeEntry.createSmart(isFriday(selectedDate));
        } else if (result.type === 'assente') {
            entry = TimeEntry.createAssente(isFriday(selectedDate));
        } else {
            if (result.type === 'entrata') {
                entry = TimeEntry.createEntrata(result.time);
            } else if (result.type === 'uscita') {
                entry = TimeEntry.createUscita(result.time);
            } else {
                entry = new TimeEntry({ type: result.type, time: result.time });
            }
        }

        // Se è un tipo speciale, verifica e pulisci il giorno
        if (result.type === 'smart' || result.type === 'assente') {
            if (this.currentWeekData.hasEntries(result.date)) {
                const confirm = await modalManager.openConfirmModal(
                    'Il giorno ha già delle registrazioni. Vuoi sostituirle?',
                    'Conferma sostituzione'
                );
                if (!confirm) return;
                this.currentWeekData.clearDay(result.date);
            }
        }

        // Aggiungi entry
        this.currentWeekData.addEntry(result.date, entry);
        await this.saveCurrentWeek();
        
        const typeLabel = this.getTypeLabel(result.type);
        this.ui.showToast(`${typeLabel} aggiunta per il ${this.formatDateShort(result.date)}`, 'success');
    }

    /**
     * Formatta data in formato breve
     * @param {string} dateKey - Data ISO
     * @returns {string}
     */
    formatDateShort(dateKey) {
        const date = parseDateISO(dateKey);
        return date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    /**
     * Ottiene label per tipo entry
     * @param {string} type - Tipo entry
     * @returns {string}
     */
    getTypeLabel(type) {
        const labels = {
            entrata: '🟢 Entrata',
            uscita: '🔴 Uscita',
            smart: '🏠 Smart Working',
            assente: '❌ Assenza'
        };
        return labels[type] || type;
    }

    /**
     * Gestisce export JSON
     */
    async handleExportJSON() {
        try {
            exportService.exportJSON(this.allData);
            this.ui.showToast('Export JSON completato', 'success');
        } catch (error) {
            console.error('Errore export JSON:', error);
            this.ui.showToast('Errore durante l\'export', 'error');
        }
    }

    /**
     * Gestisce export Excel/CSV
     */
    async handleExportExcel() {
        try {
            const weekKey = this.navigator.getViewWeekKey();
            const weekData = this.currentWeekData.toJSON();
            
            exportService.exportCSV(weekKey, weekData);
            this.ui.showToast('Export Excel completato', 'success');
        } catch (error) {
            console.error('Errore export Excel:', error);
            this.ui.showToast('Errore durante l\'export', 'error');
        }
    }

    /**
     * Gestisce import file
     * @param {File} file - File da importare
     */
    async handleImport(file) {
        try {
            const result = await exportService.importJSON(file);

            if (!result.success) {
                this.ui.showToast(result.error, 'error');
                return;
            }

            // Importa i dati (merge)
            const importResult = await this.storage.importData(result.data, true);
            
            if (importResult.success) {
                // Ricarica dati
                this.allData = await this.storage.loadAllData();
                await this.loadWeekData(this.navigator.getViewWeekKey());
                
                this.ui.showToast(
                    `Importate ${importResult.imported} settimane (${importResult.existing} già esistenti)`,
                    'success'
                );
            } else {
                this.ui.showToast('Errore durante l\'importazione', 'error');
            }
        } catch (error) {
            console.error('Errore import:', error);
            this.ui.showToast('Errore durante l\'importazione', 'error');
        }
    }

    /**
     * Gestisce backup manuale - esporta file JSON (backup reale e portabile)
     */
    async handleBackup() {
        try {
            // Esporta come file JSON (vero backup scaricabile)
            const data = await this.storage.loadAllData();
            
            if (Object.keys(data).length === 0) {
                this.ui.showToast('Nessun dato da salvare nel backup', 'warning');
                return;
            }
            
            // Crea file di backup con timestamp
            const timestamp = new Date().toISOString().slice(0, 10);
            const filename = `backup-orari-lavoro-${timestamp}.json`;
            exportService.exportJSON(data, filename);
            
            this.ui.showToast('📥 Backup scaricato! Conserva il file in un posto sicuro.', 'success');
        } catch (error) {
            console.error('Errore backup:', error);
            this.ui.showToast('Errore durante il backup', 'error');
        }
    }

    /**
     * Controlla dati vecchi da pulire
     */
    async checkOldData() {
        const oldWeeks = await this.storage.findOldWeeks(3);
        
        if (oldWeeks.length > 0) {
            const result = await modalManager.openCleanDataModal(oldWeeks);
            
            if (result?.action === 'clean') {
                // Poi pulisci
                const deleted = await this.storage.cleanOldData(oldWeeks);
                
                // Ricarica dati
                this.allData = await this.storage.loadAllData();
                await this.loadWeekData(this.navigator.getViewWeekKey());
                
                this.ui.showToast(`Eliminate ${deleted} settimane vecchie`, 'success');
            }
        }
    }
}

export default AppController;
