/**
 * ModalManager - Gestione modali dell'applicazione
 * 
 * @description Gestisce apertura, chiusura e interazione con le modali:
 * edit entry, conferme e pulizia dati.
 */

import { eventBus, EVENTS } from '../utils/EventBus.js';
import { validateTime, requiresTime } from '../utils/Validators.js';

/**
 * Classe per gestione modali
 */
export class ModalManager {
    constructor() {
        /** @type {Map<string, HTMLElement>} */
        this.modals = new Map();
        
        /** @type {string|null} */
        this.activeModal = null;
        
        /** @type {Function|null} */
        this.currentResolver = null;
        
        this.init();
    }

    /**
     * Inizializza le modali
     */
    init() {
        // Registra tutte le modali
        this.registerModal('edit', document.getElementById('editModal'));
        this.registerModal('addEntry', document.getElementById('addEntryModal'));
        this.registerModal('confirm', document.getElementById('confirmModal'));
        this.registerModal('cleanData', document.getElementById('cleanDataModal'));
        
        // Setup event listeners globali
        this.setupGlobalListeners();
    }

    /**
     * Registra una modale
     * @param {string} name - Nome identificativo
     * @param {HTMLElement} element - Elemento DOM della modale
     */
    registerModal(name, element) {
        if (element) {
            this.modals.set(name, element);
            this.setupModalListeners(name, element);
        }
    }

    /**
     * Setup listeners per una modale
     * @param {string} name - Nome modale
     * @param {HTMLElement} element - Elemento modale
     */
    setupModalListeners(name, element) {
        // Click su overlay per chiudere
        element.addEventListener('click', (e) => {
            if (e.target === element) {
                this.close();
            }
        });

        // Pulsanti con data-action
        element.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleAction(action);
            });
        });
    }

    /**
     * Setup listeners globali
     */
    setupGlobalListeners() {
        // ESC per chiudere
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModal) {
                this.close();
            }
        });
    }

    /**
     * Gestisce le azioni dei pulsanti delle modali
     * @param {string} action - Nome azione
     */
    handleAction(action) {
        switch (action) {
            case 'close':
            case 'cancel':
                this.close(null);
                break;
            case 'save':
                this.handleSave();
                break;
            case 'add':
                this.handleAdd();
                break;
            case 'delete':
                this.handleDelete();
                break;
            case 'confirm':
                this.close({ confirmed: true });
                break;
            case 'clean':
                this.close({ action: 'clean' });
                break;
        }
    }

    /**
     * Apre una modale
     * @param {string} name - Nome della modale
     * @returns {HTMLElement|null}
     */
    open(name) {
        const modal = this.modals.get(name);
        if (!modal) {
            console.warn(`Modale "${name}" non trovata`);
            return null;
        }

        // Chiudi eventuale modale aperta
        if (this.activeModal) {
            this.close(null);
        }

        modal.classList.add('is-open');
        this.activeModal = name;
        
        // Focus trap
        const firstFocusable = modal.querySelector('input, select, button');
        if (firstFocusable) {
            firstFocusable.focus();
        }

        eventBus.emit(EVENTS.MODAL_OPEN, { name });
        return modal;
    }

    /**
     * Chiude la modale attiva
     * @param {any} result - Risultato da passare al resolver
     */
    close(result = null) {
        if (!this.activeModal) return;

        const modal = this.modals.get(this.activeModal);
        if (modal) {
            modal.classList.remove('is-open');
        }

        const name = this.activeModal;
        this.activeModal = null;

        // Risolvi la promise se presente
        if (this.currentResolver) {
            this.currentResolver(result);
            this.currentResolver = null;
        }

        eventBus.emit(EVENTS.MODAL_CLOSE, { name, result });
    }

    /**
     * Apre la modale per aggiungere nuova entry
     * @param {Object} options - Opzioni
     * @param {string} [options.date] - Data preselezionata (ISO format)
     * @param {string} [options.type] - Tipo preselezionato
     * @returns {Promise<Object|null>}
     */
    openAddEntryModal({ date = null, type = 'entrata' } = {}) {
        return new Promise((resolve) => {
            this.currentResolver = resolve;
            
            const modal = this.open('addEntry');
            if (!modal) {
                resolve(null);
                return;
            }

            // Riferimenti elementi
            const dateInput = modal.querySelector('#addDate');
            const typeSelect = modal.querySelector('#addType');
            const timeInput = modal.querySelector('#addTime');
            const timeGroup = modal.querySelector('#addTimeGroup');

            // Imposta data (default: oggi)
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = date || today;
            
            // Imposta tipo
            typeSelect.value = type;
            
            // Imposta orario default basato sul tipo
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            
            if (type === 'entrata') {
                timeInput.value = currentTime; // Usa ora corrente invece di 08:00
            } else if (type === 'uscita') {
                timeInput.value = currentTime;
            } else {
                timeInput.value = '';
            }
            
            // Salva il valore corrente per Android picker issue
            this._lastTimeValue = timeInput.value;

            // Mostra/nascondi campo orario in base al tipo
            this.updateTimeFieldVisibility(typeSelect.value, timeGroup, timeInput);

            // Listener per cambio tipo
            const typeChangeHandler = () => {
                const newType = typeSelect.value;
                this.updateTimeFieldVisibility(newType, timeGroup, timeInput);
                
                // Aggiorna orario default quando cambia tipo
                if ((newType === 'entrata' || newType === 'uscita') && !timeInput.value) {
                    timeInput.value = currentTime;
                    this._lastTimeValue = currentTime;
                }
            };
            typeSelect.addEventListener('change', typeChangeHandler);
            
            // Listener per catturare cambio orario (fix per Android picker)
            const timeChangeHandler = (e) => {
                if (e.target.value) {
                    this._lastTimeValue = e.target.value;
                }
            };
            timeInput.addEventListener('change', timeChangeHandler);
            timeInput.addEventListener('input', timeChangeHandler);
            timeInput.addEventListener('blur', timeChangeHandler);

            // Salva riferimento per cleanup
            this._addTypeHandler = typeChangeHandler;
            this._addTimeHandler = timeChangeHandler;
        });
    }

    /**
     * Apre la modale di modifica entry
     * @param {Object} options - Opzioni
     * @param {string} options.date - Data ISO
     * @param {number} options.index - Indice entry
     * @param {Object} options.entry - Entry da modificare
     * @returns {Promise<Object|null>}
     */
    openEditModal({ date, index, entry }) {
        return new Promise((resolve) => {
            this.currentResolver = resolve;
            
            const modal = this.open('edit');
            if (!modal) {
                resolve(null);
                return;
            }

            // Popola il form
            const form = modal.querySelector('#editForm');
            const dateInput = modal.querySelector('#editDate');
            const typeSelect = modal.querySelector('#editType');
            const timeInput = modal.querySelector('#editTime');
            const timeGroup = modal.querySelector('#timeGroup');
            const indexInput = modal.querySelector('#editIndex');

            dateInput.value = date;
            typeSelect.value = entry.type;
            timeInput.value = entry.time || '';
            indexInput.value = index;

            // Mostra/nascondi campo orario in base al tipo
            this.updateTimeFieldVisibility(typeSelect.value, timeGroup, timeInput);

            // Listener per cambio tipo
            const typeChangeHandler = () => {
                this.updateTimeFieldVisibility(typeSelect.value, timeGroup, timeInput);
            };
            typeSelect.addEventListener('change', typeChangeHandler);

            // Salva riferimento per cleanup
            this._editTypeHandler = typeChangeHandler;
        });
    }

    /**
     * Aggiorna visibilità campo orario
     * @param {string} type - Tipo entry
     * @param {HTMLElement} timeGroup - Container campo orario
     * @param {HTMLInputElement} timeInput - Input orario
     */
    updateTimeFieldVisibility(type, timeGroup, timeInput) {
        if (requiresTime(type)) {
            timeGroup.style.display = 'block';
            timeInput.required = true;
        } else {
            timeGroup.style.display = 'none';
            timeInput.required = false;
        }
    }

    /**
     * Gestisce il salvataggio della modale edit
     */
    handleSave() {
        const modal = this.modals.get('edit');
        if (!modal) return;

        const form = modal.querySelector('#editForm');
        const dateInput = modal.querySelector('#editDate');
        const typeSelect = modal.querySelector('#editType');
        const timeInput = modal.querySelector('#editTime');
        const indexInput = modal.querySelector('#editIndex');

        // Validazione
        const type = typeSelect.value;
        const time = timeInput.value;

        if (requiresTime(type)) {
            const validation = validateTime(time);
            if (!validation.valid) {
                this.showFieldError(timeInput, validation.error);
                return;
            }
        }

        // Cleanup listener
        if (this._editTypeHandler) {
            typeSelect.removeEventListener('change', this._editTypeHandler);
            this._editTypeHandler = null;
        }

        this.close({
            action: 'save',
            date: dateInput.value,
            index: parseInt(indexInput.value, 10),
            type: type,
            time: requiresTime(type) ? time : null
        });
    }

    /**
     * Gestisce l'aggiunta dalla modale addEntry
     */
    handleAdd() {
        const modal = this.modals.get('addEntry');
        if (!modal) return;

        const dateInput = modal.querySelector('#addDate');
        const typeSelect = modal.querySelector('#addType');
        const timeInput = modal.querySelector('#addTime');

        // Validazione
        const type = typeSelect.value;
        // Usa il valore salvato dal listener se il valore corrente è vuoto (fix Android picker)
        let time = timeInput.value || this._lastTimeValue || '';
        const date = dateInput.value;

        if (!date) {
            this.showFieldError(dateInput, 'Seleziona una data');
            return;
        }

        if (requiresTime(type)) {
            const validation = validateTime(time);
            if (!validation.valid) {
                this.showFieldError(timeInput, validation.error);
                return;
            }
        }

        // Cleanup listener
        if (this._addTypeHandler) {
            typeSelect.removeEventListener('change', this._addTypeHandler);
            this._addTypeHandler = null;
        }
        if (this._addTimeHandler) {
            timeInput.removeEventListener('change', this._addTimeHandler);
            timeInput.removeEventListener('input', this._addTimeHandler);
            timeInput.removeEventListener('blur', this._addTimeHandler);
            this._addTimeHandler = null;
        }
        this._lastTimeValue = null;

        this.close({
            action: 'add',
            date: date,
            type: type,
            time: requiresTime(type) ? time : null
        });
    }

    /**
     * Gestisce l'eliminazione dalla modale edit
     */
    handleDelete() {
        const modal = this.modals.get('edit');
        if (!modal) return;

        const dateInput = modal.querySelector('#editDate');
        const indexInput = modal.querySelector('#editIndex');

        // Cleanup listener
        const typeSelect = modal.querySelector('#editType');
        if (this._editTypeHandler) {
            typeSelect.removeEventListener('change', this._editTypeHandler);
            this._editTypeHandler = null;
        }

        this.close({
            action: 'delete',
            date: dateInput.value,
            index: parseInt(indexInput.value, 10)
        });
    }

    /**
     * Mostra errore su un campo
     * @param {HTMLElement} field - Campo con errore
     * @param {string} message - Messaggio errore
     */
    showFieldError(field, message) {
        field.setCustomValidity(message);
        field.reportValidity();
        
        // Reset dopo un po'
        setTimeout(() => {
            field.setCustomValidity('');
        }, 3000);
    }

    /**
     * Apre la modale di conferma
     * @param {string} message - Messaggio da mostrare
     * @param {string} [title] - Titolo opzionale
     * @returns {Promise<boolean>}
     */
    openConfirmModal(message, title = 'Conferma') {
        return new Promise((resolve) => {
            this.currentResolver = (result) => resolve(result?.confirmed || false);
            
            const modal = this.open('confirm');
            if (!modal) {
                resolve(false);
                return;
            }

            modal.querySelector('#confirmModalTitle').textContent = title;
            modal.querySelector('#confirmMessage').textContent = message;
        });
    }

    /**
     * Apre la modale pulizia dati
     * @param {string[]} oldWeeks - Lista settimane vecchie
     * @returns {Promise<{action: string}|null>}
     */
    openCleanDataModal(oldWeeks) {
        return new Promise((resolve) => {
            this.currentResolver = resolve;
            
            const modal = this.open('cleanData');
            if (!modal) {
                resolve(null);
                return;
            }

            const list = modal.querySelector('#oldWeeksList');
            list.innerHTML = oldWeeks.map(week => `<li>${week}</li>`).join('');
        });
    }

    /**
     * Verifica se una modale è aperta
     * @param {string} [name] - Nome modale specifica
     * @returns {boolean}
     */
    isOpen(name = null) {
        if (name) {
            return this.activeModal === name;
        }
        return this.activeModal !== null;
    }
}

// Esporta istanza singleton
export const modalManager = new ModalManager();

export default ModalManager;
