/**
 * UIManager - Gestione interfaccia utente
 * 
 * @description Responsabile del rendering dell'interfaccia, gestione eventi UI,
 * toast notifications e aggiornamento elementi DOM.
 */

import { eventBus, EVENTS } from '../utils/EventBus.js';
import { formatDateWithDay, formatDateISO, isToday, isFriday, MONTH_NAMES } from '../utils/DateUtils.js';
import { sanitizeString } from '../utils/Validators.js';
import { timeCalculator, CONFIG } from '../services/TimeCalculator.js';

/**
 * Classe per gestione UI
 */
export class UIManager {
    /**
     * @param {Object} options
     * @param {Function} options.onEntrata - Callback per click Entrata
     * @param {Function} options.onUscita - Callback per click Uscita
     * @param {Function} options.onSmart - Callback per click Smart
     * @param {Function} options.onAssente - Callback per click Assente
     * @param {Function} options.onPrevWeek - Callback per navigazione indietro
     * @param {Function} options.onNextWeek - Callback per navigazione avanti
     * @param {Function} options.onEditEntry - Callback per modifica entry
     * @param {Function} options.onAddEntry - Callback per aggiunta entry su giorno specifico
     * @param {Function} options.onExportJSON - Callback per export JSON
     * @param {Function} options.onExportExcel - Callback per export Excel
     * @param {Function} options.onImport - Callback per import
     * @param {Function} options.onBackup - Callback per backup
     */
    constructor(options = {}) {
        this.callbacks = options;
        this.hasShownEditHintToast = false;
        
        // Riferimenti DOM
        this.elements = {
            weekLabel: document.getElementById('weekLabel'),
            yearLabel: document.getElementById('yearLabel'),
            currentWeekBadge: document.getElementById('currentWeekBadge'),
            weekDays: document.getElementById('weekDays'),
            totalHours: document.getElementById('totalHours'),
            balanceHours: document.getElementById('balanceHours'),
            toast: document.getElementById('toast'),
            
            // Buttons
            entrataBtn: document.getElementById('entrataBtn'),
            uscitaBtn: document.getElementById('uscitaBtn'),
            smartBtn: document.getElementById('smartBtn'),
            assenteBtn: document.getElementById('assenteBtn'),

            prevWeekBtn: document.getElementById('prevWeekBtn'),
            nextWeekBtn: document.getElementById('nextWeekBtn'),
            exportJsonBtn: document.getElementById('exportJsonBtn'),
            exportExcelBtn: document.getElementById('exportExcelBtn'),
            importBtn: document.getElementById('importBtn'),
            importFile: document.getElementById('importFile'),
            backupBtn: document.getElementById('backupBtn'),
            installBtn: document.getElementById('installBtn')
        };

        this.init();
    }

    /**
     * Inizializza l'UI
     */
    init() {
        this.setupEventListeners();
        this.setupPWAInstall();
    }

    /**
     * Configura gli event listeners
     */
    setupEventListeners() {
        const { elements, callbacks } = this;

        // Action buttons
        elements.entrataBtn?.addEventListener('click', () => {
            callbacks.onEntrata?.();
        });

        elements.uscitaBtn?.addEventListener('click', () => {
            callbacks.onUscita?.();
        });

        elements.smartBtn?.addEventListener('click', () => {
            callbacks.onSmart?.();
        });

        elements.assenteBtn?.addEventListener('click', () => {
            callbacks.onAssente?.();
        });

        // Nota: il bottone standalone "Aggiungi su altro giorno" è stato rimosso.
        // L'aggiunta si fa direttamente toccando il giorno desiderato.

        // Navigation
        elements.prevWeekBtn?.addEventListener('click', () => {
            callbacks.onPrevWeek?.();
        });

        elements.nextWeekBtn?.addEventListener('click', () => {
            callbacks.onNextWeek?.();
        });

        // Export/Import
        elements.exportJsonBtn?.addEventListener('click', () => {
            callbacks.onExportJSON?.();
        });

        elements.exportExcelBtn?.addEventListener('click', () => {
            callbacks.onExportExcel?.();
        });

        elements.importBtn?.addEventListener('click', () => {
            elements.importFile?.click();
        });

        elements.importFile?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) {
                callbacks.onImport?.(file);
                e.target.value = ''; // Reset per permettere reimport stesso file
            }
        });

        elements.backupBtn?.addEventListener('click', () => {
            callbacks.onBackup?.();
        });

        // Subscribe to events
        eventBus.on(EVENTS.TOAST_SHOW, (data) => {
            this.showToast(data.message, data.type);
        });
    }

    /**
     * Setup PWA install prompt
     */
    setupPWAInstall() {
        let deferredPrompt = null;
        const installBtn = this.elements.installBtn;
        const installBanner = document.getElementById('installBanner');
        const installBannerBtn = document.getElementById('installBannerBtn');
        const installBannerClose = document.getElementById('installBannerClose');
        const installBannerHint = document.getElementById('installBannerHint');
        const showInstallHelp = document.getElementById('showInstallHelp');
        const iosInstallModal = document.getElementById('iosInstallModal');
        const iosModalClose = document.getElementById('iosModalClose');
        const iosModalOk = document.getElementById('iosModalOk');
        
        // Chiave localStorage per tracciare dismissioni
        const INSTALL_DISMISSED_KEY = 'pwa_install_dismissed';
        const INSTALL_DISMISSED_EXPIRES = 12 * 60 * 60 * 1000; // 12 ore
        const IOS_MODAL_SHOWN_KEY = 'ios_install_modal_shown';
        const IOS_MODAL_SHOWN_EXPIRES = 24 * 60 * 60 * 1000; // 24 ore

        /**
         * Controlla se l'utente ha già chiuso il banner di recente
         */
        const wasDismissedRecently = () => {
            const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY);
            if (!dismissed) return false;
            const dismissedTime = parseInt(dismissed, 10);
            return (Date.now() - dismissedTime) < INSTALL_DISMISSED_EXPIRES;
        };

        const wasIOSModalShownRecently = () => {
            const shown = localStorage.getItem(IOS_MODAL_SHOWN_KEY);
            if (!shown) return false;
            const shownTime = parseInt(shown, 10);
            return (Date.now() - shownTime) < IOS_MODAL_SHOWN_EXPIRES;
        };

        /**
         * Controlla se è iOS (Safari)
         * Include iPadOS 13+ che si presenta come Mac
         */
        const isIOS = () => {
            // Classic iOS detection
            if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
                return true;
            }
            // Modern iPadOS 13+ detection (reports as Macintosh)
            if (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1) {
                return true;
            }
            return false;
        };
        
        /**
         * Controlla se è Android
         */
        const isAndroid = () => {
            return /Android/.test(navigator.userAgent);
        };

        /**
         * Controlla se l'app è già installata (standalone mode)
         */
        const isStandalone = () => {
            return window.matchMedia('(display-mode: standalone)').matches ||
                   window.navigator.standalone === true;
        };

        /**
         * Mostra banner installazione
         */
        const showInstallBanner = (forceShow = false) => {
            if (installBanner && (forceShow || !wasDismissedRecently()) && !isStandalone()) {
                // Adatta il messaggio al dispositivo
                if (isIOS()) {
                    installBannerHint.textContent = 'Su iPhone: Safari → Condividi → Aggiungi a Home';
                    installBannerBtn.textContent = 'Guida iPhone';
                    installBannerBtn.style.display = 'block';
                } else if (!deferredPrompt) {
                    // Browser senza supporto nativo - mostra comunque info utili
                    installBannerHint.textContent = 'Usa il menu del browser per installare';
                    installBannerBtn.style.display = 'none';
                }
                installBanner.style.display = 'block';
                document.body.classList.add('has-install-banner');
            }
        };

        /**
         * Nascondi banner installazione
         */
        const hideInstallBanner = () => {
            if (installBanner) {
                installBanner.style.display = 'none';
                document.body.classList.remove('has-install-banner');
            }
        };
        
        /**
         * Mostra modal istruzioni iOS
         */
        const showIOSModal = () => {
            if (iosInstallModal) {
                iosInstallModal.classList.add('is-open');
            }
        };
        
        /**
         * Nascondi modal iOS
         */
        const hideIOSModal = () => {
            if (iosInstallModal) {
                iosInstallModal.classList.remove('is-open');
            }
        };

        // ===========================================
        // LOGICA PRINCIPALE: Mostra banner a TUTTI i nuovi visitatori
        // ===========================================
        
        // Se l'app non è già installata e l'utente non ha dismissato di recente
        if (!isStandalone() && !wasDismissedRecently()) {
            const initialDelay = isIOS() ? 900 : 2000;
            setTimeout(() => showInstallBanner(), initialDelay);

            if (isIOS() && !wasIOSModalShownRecently()) {
                setTimeout(() => {
                    showIOSModal();
                    localStorage.setItem(IOS_MODAL_SHOWN_KEY, Date.now().toString());
                }, 1500);
            }
        }

        // iOS non espone beforeinstallprompt: mostra CTA sempre visibile in header
        if (installBtn && isIOS() && !isStandalone()) {
            installBtn.style.display = 'inline-flex';
            installBtn.textContent = '📲 Guida iPhone';
        }

        // Evento: prompt installazione disponibile (Chrome, Edge, etc.)
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            // Aggiorna UI per installazione nativa
            if (installBannerBtn) {
                installBannerBtn.textContent = 'Installa';
                installBannerBtn.style.display = 'block';
            }
            if (installBannerHint) {
                installBannerHint.textContent = 'Usa l\'app offline, sempre a portata di mano!';
            }
            
            // Mostra bottone header
            if (installBtn) {
                installBtn.style.display = 'block';
            }
            
            // Mostra banner se non già visibile
            showInstallBanner();
        });

        // Click su bottone header
        installBtn?.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    this.showToast('🎉 App installata!', 'success');
                }
                
                deferredPrompt = null;
                installBtn.style.display = 'none';
                hideInstallBanner();
            } else if (isIOS()) {
                showIOSModal();
            }
        });

        // Click su bottone banner
        installBannerBtn?.addEventListener('click', async () => {
            if (isIOS()) {
                // iOS: mostra istruzioni
                showIOSModal();
                hideInstallBanner();
            } else if (deferredPrompt) {
                // Chrome/Edge: trigger installazione nativa
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    this.showToast('🎉 App installata con successo!', 'success');
                }
                
                deferredPrompt = null;
                hideInstallBanner();
                if (installBtn) installBtn.style.display = 'none';
            }
        });

        // Click su chiudi banner
        installBannerClose?.addEventListener('click', () => {
            hideInstallBanner();
            localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString());
        });
        
        // Click su link footer "Installa l'app"
        showInstallHelp?.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (isStandalone()) {
                this.showToast('✅ L\'app è già installata!', 'success');
                return;
            }
            
            if (isIOS()) {
                showIOSModal();
            } else if (deferredPrompt) {
                deferredPrompt.prompt();
            } else {
                // Mostra banner con istruzioni generiche
                showInstallBanner(true);
            }
        });
        
        // Chiudi modal iOS
        iosModalClose?.addEventListener('click', hideIOSModal);
        iosModalOk?.addEventListener('click', () => {
            hideIOSModal();
            localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString());
            this.showToast('👍 Segui i passaggi per installare!', 'info');
        });
        
        // Chiudi modal cliccando fuori
        iosInstallModal?.addEventListener('click', (e) => {
            if (e.target === iosInstallModal) {
                hideIOSModal();
            }
        });

        // App installata
        window.addEventListener('appinstalled', () => {
            hideInstallBanner();
            if (installBtn) installBtn.style.display = 'none';
            if (showInstallHelp) showInstallHelp.style.display = 'none';
            this.showToast('🎉 App installata con successo!', 'success');
        });
    }

    /**
     * Aggiorna la vista della settimana
     * @param {Object} weekInfo - Info settimana
     * @param {Object} weekData - Dati della settimana
     */
    renderWeek(weekInfo, weekData) {
        // Aggiorna header settimana
        this.elements.weekLabel.textContent = `Settimana ${weekInfo.week}`;
        this.elements.yearLabel.textContent = weekInfo.year;

        // Indicatore periodo settimana
        this.renderWeekPeriod(weekInfo);
        
        // Badge settimana corrente
        if (weekInfo.isCurrent) {
            this.elements.currentWeekBadge.style.display = 'inline-flex';
        } else {
            this.elements.currentWeekBadge.style.display = 'none';
        }

        // Render giorni
        this.renderDays(weekInfo.days, weekData);

        // Suggerimento uscita venerdì
        this.renderFridayExitHint(weekInfo, weekData);

        // Calcola e mostra totali
        this.updateTotals(weekData);
    }

    /**
     * Render dei giorni della settimana
     * @param {Array} days - Info giorni
     * @param {Object} weekData - Dati settimana
     */
    renderDays(days, weekData) {
        const container = this.elements.weekDays;
        container.innerHTML = '';

        for (const day of days) {
            const entries = weekData[day.dateKey] || [];
            const dayCard = this.createDayCard(day, entries);
            container.appendChild(dayCard);
        }
    }

    /**
     * Crea la card di un giorno
     * @param {Object} day - Info giorno
     * @param {Array} entries - Entry del giorno
     * @returns {HTMLElement}
     */
    createDayCard(day, entries) {
        const card = document.createElement('article');
        card.className = 'day-card';
        
        if (day.isToday) {
            card.classList.add('is-today');
        }

        // Calcola ore del giorno
        const dayHours = timeCalculator.calculateDayHours(entries, day.dateKey);

        // Calcola delta giornaliero (minuti extra/deficit)
        const delta = timeCalculator.calculateDayDelta(entries, day.dateKey);
        let deltaHTML = '';
        if (delta && !delta.hasIncomplete) {
            const deltaClass = delta.isPositive ? 'delta-positive' : delta.isNegative ? 'delta-negative' : 'delta-neutral';
            deltaHTML = `<span class="day-delta ${deltaClass}">${delta.formatted}</span>`;
        } else if (delta && delta.hasIncomplete) {
            deltaHTML = `<span class="day-delta delta-in-progress">in corso…</span>`;
        }

        // Header
        const header = document.createElement('header');
        header.className = 'day-header';
        header.innerHTML = `
            <div>
                <span class="day-name">${this.getDayName(day.dayOfWeek)}</span>
                <span class="day-date">${this.formatDate(day.date)}</span>
            </div>
            <div class="day-hours-wrapper">
                <span class="day-hours">${dayHours.formatted}</span>
                ${deltaHTML}
            </div>
        `;
        card.appendChild(header);

        // Entries
        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'day-entries';

        if (entries.length === 0) {
            entriesContainer.classList.add('empty', 'clickable');
            entriesContainer.innerHTML = `
                <span class="empty-text">Nessuna registrazione</span>
                <span class="add-hint">+ Tocca per aggiungere</span>
            `;
            
            // Click handler per giorno vuoto
            const handleEmptyClick = () => {
                this.callbacks.onAddEntry?.(day.dateKey);
            };
            
            entriesContainer.addEventListener('click', handleEmptyClick);
            entriesContainer.setAttribute('role', 'button');
            entriesContainer.setAttribute('tabindex', '0');
            entriesContainer.setAttribute('aria-label', `Aggiungi registrazione per ${this.getDayName(day.dayOfWeek)}`);
            
            entriesContainer.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleEmptyClick();
                }
            });
        } else {
            entries.forEach((entry, index) => {
                const entryEl = this.createEntryItem(entry, day.dateKey, index);
                entriesContainer.appendChild(entryEl);
            });
            
            // Aggiungi bottone "+" per aggiungere altre entry al giorno
            const addMoreBtn = document.createElement('button');
            addMoreBtn.className = 'btn-add-more';
            addMoreBtn.innerHTML = '+ Aggiungi';
            addMoreBtn.setAttribute('aria-label', 'Aggiungi altra registrazione');
            addMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.callbacks.onAddEntry?.(day.dateKey);
            });
            entriesContainer.appendChild(addMoreBtn);
        }

        card.appendChild(entriesContainer);
        return card;
    }

    /**
     * Crea l'elemento di una singola entry
     * @param {Object} entry - Dati entry
     * @param {string} dateKey - Data ISO
     * @param {number} index - Indice entry
     * @returns {HTMLElement}
     */
    createEntryItem(entry, dateKey, index) {
        const item = document.createElement('div');
        item.className = 'entry-item';

        // Gestisci correttamente il display value
        let displayValue;
        if (entry.time) {
            displayValue = entry.time;
        } else if (entry.hours !== undefined && entry.hours !== null) {
            displayValue = `${entry.hours}h`;
        } else {
            // Fallback per entry incomplete (es. entrata senza orario)
            displayValue = '--:--';
        }
        const typeLabel = this.getTypeLabel(entry.type);
        const typeClass = `type-${entry.type}`;

        item.innerHTML = `
            <div class="entry-info">
                <span class="entry-time">${sanitizeString(displayValue)}</span>
                <span class="entry-type ${typeClass}">${typeLabel}</span>
            </div>
            <button type="button" class="entry-edit-btn" aria-label="Correggi registrazione" title="Solo correzione manuale">Correggi</button>
        `;

        const editBtn = item.querySelector('.entry-edit-btn');
        const handleEdit = () => {
            this.callbacks.onEditEntry?.(dateKey, index, entry);
        };

        editBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            handleEdit();
        });

        item.addEventListener('click', () => {
            if (this.hasShownEditHintToast) return;
            this.hasShownEditHintToast = true;
            this.showToast('Per timbrare usa i pulsanti Entrata/Uscita in alto. "Correggi" serve solo per modifiche manuali.', 'info');
        });

        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                if (this.hasShownEditHintToast) return;
                e.preventDefault();
                this.hasShownEditHintToast = true;
                this.showToast('Usa i pulsanti automatici in alto; modifica solo in caso di correzione.', 'info');
            }
        });

        return item;
    }

    /**
     * Aggiorna i totali della settimana
     * @param {Object} weekData - Dati settimana
     */
    updateTotals(weekData) {
        const weekTotal = timeCalculator.calculateWeekTotal(weekData);
        const balance = timeCalculator.calculateBalance(weekTotal.minutes);

        this.elements.totalHours.textContent = weekTotal.formatted;
        this.elements.balanceHours.textContent = balance.formatted;

        // Aggiorna classe per colore
        this.elements.balanceHours.classList.remove('balance-positive', 'balance-negative', 'balance-neutral');
        
        if (balance.isPositive) {
            this.elements.balanceHours.classList.add('balance-positive');
        } else if (balance.isNegative) {
            this.elements.balanceHours.classList.add('balance-negative');
        } else {
            this.elements.balanceHours.classList.add('balance-neutral');
        }
    }

    /**
     * Mostra un toast notification
     * @param {string} message - Messaggio
     * @param {string} [type='info'] - Tipo: success, error, warning, info
     * @param {number} [duration=3000] - Durata in ms
     */
    showToast(message, type = 'info', duration = 3000) {
        const toast = this.elements.toast;
        
        // Reset classi
        toast.className = 'toast';
        
        if (type !== 'info') {
            toast.classList.add(`toast-${type}`);
        }
        
        toast.textContent = message;
        toast.classList.add('is-visible');

        // Auto-hide
        setTimeout(() => {
            toast.classList.remove('is-visible');
        }, duration);
    }

    /**
     * Ottiene il nome del giorno
     * @param {number} dayOfWeek - Giorno (0=Dom, 1=Lun, ...)
     * @returns {string}
     */
    getDayName(dayOfWeek) {
        const names = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        return names[dayOfWeek];
    }

    /**
     * Formatta una data per la UI
     * @param {Date} date - Data
     * @returns {string}
     */
    formatDate(date) {
        return `${date.getDate()}/${date.getMonth() + 1}`;
    }

    /**
     * Ottiene l'etichetta del tipo entry
     * @param {string} type - Tipo
     * @returns {string}
     */
    getTypeLabel(type) {
        const labels = {
            'entrata': 'Entrata',
            'uscita': 'Uscita',
            'smart': 'Smart Working',
            'assente': 'Assente'
        };
        return labels[type] || type;
    }

    /**
     * Abilita/disabilita un bottone
     * @param {string} buttonName - Nome bottone
     * @param {boolean} enabled - Stato
     */
    setButtonEnabled(buttonName, enabled) {
        const btn = this.elements[buttonName];
        if (btn) {
            btn.disabled = !enabled;
        }
    }

    /**
     * Mostra indicatore di caricamento
     * @param {boolean} show - Mostrare/nascondere
     */
    showLoading(show) {
        // Implementazione semplice: disabilita tutti i bottoni
        const buttons = ['entrataBtn', 'uscitaBtn', 'smartBtn', 'assenteBtn'];
        buttons.forEach(btn => this.setButtonEnabled(btn, !show));
    }

    /**
     * Mostra indicatore periodo della settimana (Lun–Dom completa)
     * @param {Object} weekInfo - Info settimana
     */
    renderWeekPeriod(weekInfo) {
        let periodEl = document.getElementById('weekPeriod');
        if (!periodEl) {
            periodEl = document.createElement('span');
            periodEl.id = 'weekPeriod';
            periodEl.className = 'week-period';
            // Inserisci dopo il badge o yearLabel nel week-indicator
            const indicator = document.querySelector('.week-indicator');
            if (indicator) {
                indicator.appendChild(periodEl);
            }
        }

        // Calcola range date della settimana completa (Lun–Dom)
        const days = weekInfo.days || [];
        if (days.length === 0) {
            periodEl.textContent = '';
            return;
        }

        // Lunedì è il primo giorno lavorativo
        const monday = days[0].date;
        // Calcola Domenica = Lunedì + 6 giorni
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const firstDayNum = monday.getDate();
        const lastDayNum = sunday.getDate();
        const monthStart = MONTH_NAMES[monday.getMonth()];
        const monthEnd = MONTH_NAMES[sunday.getMonth()];

        // Range date completo Lun–Dom (es. "24 Feb – 2 Mar")
        let dateRange;
        if (monday.getMonth() === sunday.getMonth()) {
            dateRange = `${firstDayNum}–${lastDayNum} ${monthStart.slice(0, 3)}`;
        } else {
            dateRange = `${firstDayNum} ${monthStart.slice(0, 3)} – ${lastDayNum} ${monthEnd.slice(0, 3)}`;
        }

        // Se è la settimana corrente, mostra in che punto siamo (senza emoji calendario)
        if (weekInfo.isCurrent) {
            const todayDow = new Date().getDay(); // 0=dom, 1=lun, ..., 5=ven
            let periodLabel;
            if (todayDow === 1) {
                periodLabel = 'Inizio settimana';
            } else if (todayDow === 2 || todayDow === 3) {
                periodLabel = 'Metà settimana';
            } else if (todayDow === 4) {
                periodLabel = 'Quasi fine settimana';
            } else if (todayDow === 5) {
                periodLabel = 'Ultimo giorno lavorativo';
            } else {
                periodLabel = 'Weekend';
            }
            periodEl.textContent = `${dateRange} · ${periodLabel}`;
        } else {
            periodEl.textContent = dateRange;
        }
    }

    /**
     * Mostra suggerimento uscita anticipata venerdì con minuti extra accumulati
     * @param {Object} weekInfo - Info settimana
     * @param {Object} weekData - Dati settimana
     */
    renderFridayExitHint(weekInfo, weekData) {
        // Rimuovi hint precedente se esiste
        const existingHint = document.getElementById('fridayExitHint');
        if (existingHint) existingHint.remove();

        // Calcola suggerimento
        const suggestion = timeCalculator.calculateFridayExitSuggestion(weekData);
        if (!suggestion) return;

        // Trova la card del venerdì
        const dayCards = document.querySelectorAll('.day-card');
        let fridayCard = null;
        const days = weekInfo.days || [];
        for (let i = 0; i < days.length; i++) {
            if (days[i].dateKey === suggestion.fridayDateKey && dayCards[i]) {
                fridayCard = dayCards[i];
                break;
            }
        }
        if (!fridayCard) return;

        const extraFormatted = timeCalculator.formatDeltaMinutes(suggestion.extraMinutes);
        const hint = document.createElement('div');
        hint.id = 'fridayExitHint';
        hint.className = 'friday-exit-hint';

        if (suggestion.hasFridayComplete) {
            // Venerdì già completato: non mostrare suggerimento
            return;
        }

        if (suggestion.exitTime && suggestion.extraMinutes !== 0) {
            // Ha entrata e ci sono extra: mostra suggerimento uscita
            const adjustedHours = Math.floor(suggestion.fridayTargetMinutes / 60);
            const adjustedMins = suggestion.fridayTargetMinutes % 60;
            const adjustedFormatted = adjustedMins > 0 
                ? `${adjustedHours}h ${adjustedMins}m` 
                : `${adjustedHours}h`;

            hint.innerHTML = `
                <span class="friday-hint-icon">🕐</span>
                <span class="friday-hint-text">
                    Extra Lun–Gio: <strong>${extraFormatted}</strong> → 
                    Target venerdì: <strong>${adjustedFormatted}</strong> → 
                    Uscita suggerita: <strong>${suggestion.exitTime}</strong>
                </span>
            `;
        } else if (suggestion.exitTime && suggestion.extraMinutes === 0) {
            // Ha entrata ma zero extra
            hint.innerHTML = `
                <span class="friday-hint-icon">🕐</span>
                <span class="friday-hint-text">
                    Nessun extra accumulato → Uscita regolare: <strong>${suggestion.exitTime}</strong>
                </span>
            `;
        } else if (!suggestion.hasFridayEntrata && suggestion.extraMinutes !== 0) {
            // Non ha ancora timbrato entrata ma ci sono extra da scalare
            const adjustedHours = Math.floor(suggestion.fridayTargetMinutes / 60);
            const adjustedMins = suggestion.fridayTargetMinutes % 60;
            const adjustedFormatted = adjustedMins > 0 
                ? `${adjustedHours}h ${adjustedMins}m` 
                : `${adjustedHours}h`;

            hint.innerHTML = `
                <span class="friday-hint-icon">💡</span>
                <span class="friday-hint-text">
                    Extra Lun–Gio: <strong>${extraFormatted}</strong> → 
                    Target venerdì: <strong>${adjustedFormatted}</strong>
                </span>
            `;
        } else {
            return; // Nessun suggerimento utile
        }

        fridayCard.appendChild(hint);
    }
}

export default UIManager;
