/**
 * ExportService - Service per esportazione dati
 * 
 * @description Gestisce l'esportazione dei dati in formato JSON e CSV,
 * e l'importazione da file JSON.
 */

import { formatDateIT, DAY_NAMES, parseWeekKey, getWorkWeekDates, formatDateISO } from '../utils/DateUtils.js';
import { validateImportData } from '../utils/Validators.js';
import { timeCalculator } from './TimeCalculator.js';

/**
 * Classe per operazioni di export/import
 */
export class ExportService {
    /**
     * Esporta tutti i dati in formato JSON
     * @param {Object} data - Dati da esportare
     * @param {string} [filename] - Nome file (opzionale)
     * @returns {void}
     */
    exportJSON(data, filename = null) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        
        // Genera nome file se non specificato
        const fileName = filename || this.generateFilename('json');
        
        this.downloadBlob(blob, fileName);
    }

    /**
     * Esporta i dati di una settimana in formato CSV
     * @param {string} weekKey - Chiave settimana
     * @param {Object} weekData - Dati della settimana
     * @returns {void}
     */
    exportCSV(weekKey, weekData) {
        const csv = this.generateCSV(weekKey, weekData);
        // UTF-8 BOM + encoding corretto per Excel
        const BOM = '\uFEFF';
        const csvContent = BOM + csv;
        // Usa Uint8Array con TextEncoder per encoding UTF-8 corretto
        const encoder = new TextEncoder();
        const csvBytes = encoder.encode(csvContent);
        const blob = new Blob([csvBytes], { type: 'text/csv;charset=utf-8' });
        
        const fileName = this.generateFilename('csv', weekKey);
        this.downloadBlob(blob, fileName);
    }

    /**
     * Genera il contenuto CSV per una settimana
     * Usa punto e virgola come separatore per compatibilità Excel italiano
     * @param {string} weekKey - Chiave settimana
     * @param {Object} weekData - Dati della settimana
     * @returns {string} Contenuto CSV
     */
    generateCSV(weekKey, weekData) {
        const SEP = ';';
        const lines = [];
        
        // Header
        lines.push(['Data', 'Giorno', 'Tipo', 'Orario', 'Ore Lavorate'].join(SEP));
        
        // Parse week key per ottenere le date
        const { year, week } = parseWeekKey(weekKey);
        const dates = getWorkWeekDates(year, week);
        
        let totalMinutes = 0;
        
        // Per ogni giorno lavorativo
        for (const date of dates) {
            const dateKey = formatDateISO(date);
            const entries = weekData[dateKey] || [];
            const dayName = DAY_NAMES[date.getDay()];
            // Formato data con zeri iniziali per evitare ambiguità in Excel
            const dateStr = this.formatDateCSV(date);
            
            // Calcola ore del giorno
            const dayHours = timeCalculator.calculateDayHours(entries, dateKey);
            totalMinutes += dayHours.minutes;
            
            if (entries.length === 0) {
                // Giorno senza registrazioni
                lines.push([dateStr, dayName, '-', '-', '-'].join(SEP));
            } else {
                // Prima entry con ore calcolate
                const firstEntry = entries[0];
                const firstType = this.getTypeLabel(firstEntry.type);
                const firstValue = firstEntry.time || (firstEntry.hours !== undefined ? `${firstEntry.hours}h` : '--:--');
                
                if (entries.length === 1) {
                    lines.push([dateStr, dayName, firstType, firstValue, dayHours.formatted].join(SEP));
                } else {
                    // Più entry: la prima con le ore, le altre senza
                    lines.push([dateStr, dayName, firstType, firstValue, ''].join(SEP));
                    
                    for (let i = 1; i < entries.length; i++) {
                        const entry = entries[i];
                        const type = this.getTypeLabel(entry.type);
                        const value = entry.time || (entry.hours !== undefined ? `${entry.hours}h` : '--:--');
                        
                        // Ultima entry ha le ore calcolate
                        const hours = i === entries.length - 1 ? dayHours.formatted : '';
                        lines.push([dateStr, dayName, type, value, hours].join(SEP));
                    }
                }
            }
        }
        
        // Riga vuota e totali
        lines.push('');
        
        // Totali
        const totalFormatted = this.minutesToTimeString(totalMinutes);
        const balance = timeCalculator.calculateBalance(totalMinutes);
        
        lines.push(['', '', '', 'TOTALE SETTIMANA', totalFormatted].join(SEP));
        lines.push(['', '', '', 'ORE RICHIESTE', '36:00'].join(SEP));
        lines.push(['', '', '', 'SALDO', balance.formatted].join(SEP));
        
        return lines.join('\n');
    }

    /**
     * Formatta una data per il CSV con zeri iniziali (DD/MM/YYYY)
     * @param {Date} date - Data da formattare
     * @returns {string} Data formattata
     */
    formatDateCSV(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    /**
     * Importa dati da file JSON
     * @param {File} file - File da importare
     * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
     */
    async importJSON(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Valida la struttura
                    const validation = validateImportData(data);
                    
                    if (!validation.valid) {
                        resolve({
                            success: false,
                            error: `Dati non validi: ${validation.errors.join(', ')}`
                        });
                        return;
                    }
                    
                    // Warning se presenti (non bloccanti)
                    if (validation.warnings.length > 0) {
                        console.warn('Avvisi importazione:', validation.warnings);
                    }
                    
                    resolve({
                        success: true,
                        data: data,
                        warnings: validation.warnings
                    });
                } catch (error) {
                    resolve({
                        success: false,
                        error: `Errore parsing JSON: ${error.message}`
                    });
                }
            };
            
            reader.onerror = () => {
                resolve({
                    success: false,
                    error: 'Errore lettura file'
                });
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Genera il nome file per l'export
     * @param {string} extension - Estensione file (json, csv)
     * @param {string} [weekKey] - Chiave settimana (opzionale)
     * @returns {string}
     */
    generateFilename(extension, weekKey = null) {
        if (weekKey) {
            return `orari-lavoro-${weekKey}.${extension}`;
        }
        
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 10);
        return `orari-lavoro-${timestamp}.${extension}`;
    }

    /**
     * Scarica un blob come file
     * @param {Blob} blob - Blob da scaricare
     * @param {string} filename - Nome file
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Cleanup
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    /**
     * Ottiene l'etichetta del tipo entry
     * @param {string} type - Tipo entry
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
     * Converte minuti in formato HH:MM
     * @param {number} minutes - Minuti totali
     * @returns {string}
     */
    minutesToTimeString(minutes) {
        const hours = Math.floor(Math.abs(minutes) / 60);
        const mins = Math.abs(minutes) % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    /**
     * Genera un report testuale della settimana
     * @param {string} weekKey - Chiave settimana
     * @param {Object} weekData - Dati della settimana
     * @returns {string}
     */
    generateTextReport(weekKey, weekData) {
        const lines = [];
        const { year, week } = parseWeekKey(weekKey);
        
        lines.push(`=== REPORT SETTIMANA ${week} - ${year} ===`);
        lines.push('');
        
        const dates = getWorkWeekDates(year, week);
        let totalMinutes = 0;
        
        for (const date of dates) {
            const dateKey = formatDateISO(date);
            const entries = weekData[dateKey] || [];
            const dayName = DAY_NAMES[date.getDay()];
            const dayHours = timeCalculator.calculateDayHours(entries, dateKey);
            
            totalMinutes += dayHours.minutes;
            
            lines.push(`${dayName} ${formatDateIT(date, false)}`);
            
            if (entries.length === 0) {
                lines.push('  - Nessuna registrazione');
            } else {
                for (const entry of entries) {
                    const value = entry.time || (entry.hours !== undefined ? `${entry.hours}h` : '--:--');
                    lines.push(`  ${this.getTypeLabel(entry.type)}: ${value}`);
                }
                lines.push(`  → Ore: ${dayHours.formatted}`);
            }
            lines.push('');
        }
        
        const balance = timeCalculator.calculateBalance(totalMinutes);
        
        lines.push('-----------------------------------');
        lines.push(`TOTALE: ${this.minutesToTimeString(totalMinutes)} / 36:00`);
        lines.push(`SALDO: ${balance.formatted}`);
        
        return lines.join('\n');
    }
}

// Esporta istanza singleton
export const exportService = new ExportService();

export default ExportService;
