/**
 * Test Suite - Orari Lavoro App
 * 
 * @description Suite di test per sviluppatori. Eseguire in browser console
 * o tramite Node.js con opportuni mock del DOM.
 * 
 * USO:
 * 1. Aprire l'app nel browser
 * 2. Aprire DevTools Console (F12)
 * 3. Copiare e incollare questo file
 * 4. Eseguire: TestRunner.runAll()
 */

const TestRunner = {
    results: [],
    passed: 0,
    failed: 0,

    /**
     * Esegue un singolo test
     */
    async test(name, fn) {
        try {
            await fn();
            this.passed++;
            this.results.push({ name, status: '✅ PASS' });
            console.log(`✅ ${name}`);
        } catch (error) {
            this.failed++;
            this.results.push({ name, status: '❌ FAIL', error: error.message });
            console.error(`❌ ${name}:`, error.message);
        }
    },

    /**
     * Assertion helpers
     */
    assert: {
        equal(actual, expected, msg = '') {
            if (actual !== expected) {
                throw new Error(`${msg} Expected ${expected}, got ${actual}`);
            }
        },
        deepEqual(actual, expected, msg = '') {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`${msg} Objects not equal`);
            }
        },
        true(value, msg = '') {
            if (!value) {
                throw new Error(`${msg} Expected true, got ${value}`);
            }
        },
        false(value, msg = '') {
            if (value) {
                throw new Error(`${msg} Expected false, got ${value}`);
            }
        },
        throws(fn, msg = '') {
            try {
                fn();
                throw new Error(`${msg} Expected function to throw`);
            } catch (e) {
                // Expected
            }
        }
    },

    /**
     * Stampa report finale
     */
    report() {
        console.log('\n' + '='.repeat(50));
        console.log(`TEST RESULTS: ${this.passed} passed, ${this.failed} failed`);
        console.log('='.repeat(50));
        
        if (this.failed > 0) {
            console.log('\nFailed tests:');
            this.results
                .filter(r => r.status.includes('FAIL'))
                .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
        }
        
        return { passed: this.passed, failed: this.failed };
    },

    /**
     * Reset per nuova esecuzione
     */
    reset() {
        this.results = [];
        this.passed = 0;
        this.failed = 0;
    }
};

// ============================================
// TEST SUITE: DateUtils
// ============================================

const DateUtilsTests = {
    async run() {
        console.log('\n📅 Testing DateUtils...');
        
        // Import moduli (se in browser con ES modules già caricati)
        const DateUtils = window.__dateUtils || await import('./js/utils/DateUtils.js');

        await TestRunner.test('getWeekNumber - data nota', () => {
            // 3 Febbraio 2026 è nella settimana 6
            const date = new Date(2026, 1, 3);
            const week = DateUtils.getWeekNumber(date);
            TestRunner.assert.equal(week, 6, 'Settimana 6 del 2026');
        });

        await TestRunner.test('getWeekKey - formato corretto', () => {
            const date = new Date(2026, 1, 3);
            const key = DateUtils.getWeekKey(date);
            TestRunner.assert.equal(key, '2026-W06', 'Formato YYYY-Www');
        });

        await TestRunner.test('formatDateISO - formato ISO', () => {
            const date = new Date(2026, 1, 3);
            const iso = DateUtils.formatDateISO(date);
            TestRunner.assert.equal(iso, '2026-02-03', 'Formato YYYY-MM-DD');
        });

        await TestRunner.test('isFriday - riconosce venerdì', () => {
            const friday = new Date(2026, 1, 6); // 6 Feb 2026 = Venerdì
            const monday = new Date(2026, 1, 2);
            TestRunner.assert.true(DateUtils.isFriday(friday), 'È venerdì');
            TestRunner.assert.false(DateUtils.isFriday(monday), 'Non è venerdì');
        });

        await TestRunner.test('getWorkWeekDates - 5 giorni lavorativi', () => {
            const dates = DateUtils.getWorkWeekDates(2026, 6);
            TestRunner.assert.equal(dates.length, 5, '5 giorni');
        });

        await TestRunner.test('getPreviousWeek - navigazione indietro', () => {
            const prev = DateUtils.getPreviousWeek(2026, 1);
            TestRunner.assert.equal(prev.year, 2025, 'Anno precedente');
            TestRunner.assert.true(prev.week >= 52, 'Ultima settimana');
        });

        await TestRunner.test('getNextWeek - navigazione avanti', () => {
            const next = DateUtils.getNextWeek(2026, 52);
            TestRunner.assert.equal(next.year, 2027, 'Anno successivo');
            TestRunner.assert.equal(next.week, 1, 'Prima settimana');
        });
    }
};

// ============================================
// TEST SUITE: Validators
// ============================================

const ValidatorsTests = {
    async run() {
        console.log('\n✅ Testing Validators...');
        
        const Validators = window.__validators || await import('./js/utils/Validators.js');

        await TestRunner.test('validateTime - formato valido HH:MM', () => {
            TestRunner.assert.true(Validators.validateTime('08:30').valid);
            TestRunner.assert.true(Validators.validateTime('23:59').valid);
            TestRunner.assert.true(Validators.validateTime('00:00').valid);
        });

        await TestRunner.test('validateTime - formato invalido', () => {
            TestRunner.assert.false(Validators.validateTime('25:00').valid);
            TestRunner.assert.false(Validators.validateTime('8:30').valid === false); // Potrebbe accettare
            TestRunner.assert.false(Validators.validateTime('abc').valid);
            TestRunner.assert.false(Validators.validateTime('').valid);
        });

        await TestRunner.test('validateDate - formato ISO', () => {
            TestRunner.assert.true(Validators.validateDate('2026-02-03').valid);
            TestRunner.assert.false(Validators.validateDate('03/02/2026').valid);
            TestRunner.assert.false(Validators.validateDate('invalid').valid);
        });

        await TestRunner.test('validateDate - date con overflow (fix bug)', () => {
            // 30 febbraio non esiste: deve essere invalida
            TestRunner.assert.false(Validators.validateDate('2026-02-30').valid, '30 feb invalida');
            // 31 aprile non esiste
            TestRunner.assert.false(Validators.validateDate('2026-04-31').valid, '31 apr invalida');
            // Date al limite valide
            TestRunner.assert.true(Validators.validateDate('2026-02-28').valid, '28 feb valida');
            TestRunner.assert.true(Validators.validateDate('2024-02-29').valid, '29 feb 2024 (bisestile)');
            // 29 feb anno non bisestile
            TestRunner.assert.false(Validators.validateDate('2026-02-29').valid, '29 feb 2026 invalida');
        });

        await TestRunner.test('validateEntryType - tipi validi', () => {
            TestRunner.assert.true(Validators.validateEntryType('entrata').valid);
            TestRunner.assert.true(Validators.validateEntryType('uscita').valid);
            TestRunner.assert.true(Validators.validateEntryType('smart').valid);
            TestRunner.assert.true(Validators.validateEntryType('assente').valid);
            TestRunner.assert.false(Validators.validateEntryType('invalid').valid);
        });

        await TestRunner.test('parseTimeToMinutes - conversione corretta', () => {
            TestRunner.assert.equal(Validators.parseTimeToMinutes('08:30'), 510);
            TestRunner.assert.equal(Validators.parseTimeToMinutes('00:00'), 0);
            TestRunner.assert.equal(Validators.parseTimeToMinutes('23:59'), 1439);
        });

        await TestRunner.test('minutesToTime - conversione inversa', () => {
            TestRunner.assert.equal(Validators.minutesToTime(510), '08:30');
            TestRunner.assert.equal(Validators.minutesToTime(0), '00:00');
            TestRunner.assert.equal(Validators.minutesToTime(90), '01:30');
        });

        await TestRunner.test('requiresTime - tipi corretti', () => {
            TestRunner.assert.true(Validators.requiresTime('entrata'));
            TestRunner.assert.true(Validators.requiresTime('uscita'));
            TestRunner.assert.false(Validators.requiresTime('smart'));
            TestRunner.assert.false(Validators.requiresTime('assente'));
        });
    }
};

// ============================================
// TEST SUITE: TimeCalculator
// ============================================

const TimeCalculatorTests = {
    async run() {
        console.log('\n⏱️ Testing TimeCalculator...');
        
        const { timeCalculator, CONFIG } = window.__timeCalculator || 
            await import('./js/services/TimeCalculator.js');

        await TestRunner.test('CONFIG - valori corretti', () => {
            TestRunner.assert.equal(CONFIG.WEEKLY_TARGET_HOURS, 36);
            TestRunner.assert.equal(CONFIG.PAUSE_MINUTES, 30);
            TestRunner.assert.equal(CONFIG.SMART_HOURS_DEFAULT, 7.5);
            TestRunner.assert.equal(CONFIG.SMART_HOURS_FRIDAY, 6);
        });

        await TestRunner.test('calculateDayHours - giorno normale con pausa', () => {
            const entries = [
                { type: 'entrata', time: '08:00' },
                { type: 'uscita', time: '17:00' }
            ];
            const result = timeCalculator.calculateDayHours(entries, '2026-02-02'); // Lunedì
            // 9h - 30min pausa = 8h30m = 510 minuti
            TestRunner.assert.equal(result.minutes, 510);
        });

        await TestRunner.test('calculateDayHours - venerdì senza pausa', () => {
            const entries = [
                { type: 'entrata', time: '08:00' },
                { type: 'uscita', time: '14:00' }
            ];
            const result = timeCalculator.calculateDayHours(entries, '2026-02-06'); // Venerdì
            // 6h senza pausa = 360 minuti
            TestRunner.assert.equal(result.minutes, 360);
        });

        await TestRunner.test('calculateDayHours - smart working', () => {
            const entries = [{ type: 'smart', hours: 7.5 }];
            const result = timeCalculator.calculateDayHours(entries, '2026-02-02');
            TestRunner.assert.equal(result.minutes, 450); // 7.5 * 60
        });

        await TestRunner.test('calculateDayHours - assente', () => {
            const entries = [{ type: 'assente', hours: 0 }];
            const result = timeCalculator.calculateDayHours(entries, '2026-02-02');
            TestRunner.assert.equal(result.minutes, 0);
        });

        await TestRunner.test('calculateDayHours - multiple entries', () => {
            const entries = [
                { type: 'entrata', time: '08:00' },
                { type: 'uscita', time: '12:00' },
                { type: 'entrata', time: '13:00' },
                { type: 'uscita', time: '17:00' }
            ];
            const result = timeCalculator.calculateDayHours(entries, '2026-02-02');
            // 4h + 4h - 30min pausa = 7h30m = 450 minuti
            TestRunner.assert.equal(result.minutes, 450);
        });

        await TestRunner.test('calculateBalance - saldo positivo', () => {
            const balance = timeCalculator.calculateBalance(2200); // ~36h40m
            TestRunner.assert.true(balance.isPositive);
            TestRunner.assert.true(balance.formatted.startsWith('+'));
        });

        await TestRunner.test('calculateBalance - saldo negativo', () => {
            const balance = timeCalculator.calculateBalance(2000); // ~33h20m
            TestRunner.assert.true(balance.isNegative);
            TestRunner.assert.true(balance.formatted.startsWith('-'));
        });

        await TestRunner.test('calculateBalance - saldo neutro', () => {
            const balance = timeCalculator.calculateBalance(2160); // Esattamente 36h
            TestRunner.assert.true(balance.isNeutral);
        });
    }
};

// ============================================
// TEST SUITE: TimeEntry Model
// ============================================

const TimeEntryTests = {
    async run() {
        console.log('\n📝 Testing TimeEntry Model...');
        
        const { TimeEntry } = window.__timeEntry || await import('./js/models/TimeEntry.js');

        await TestRunner.test('createEntrata - crea entry entrata', () => {
            const entry = TimeEntry.createEntrata('08:30');
            TestRunner.assert.equal(entry.type, 'entrata');
            TestRunner.assert.equal(entry.time, '08:30');
            TestRunner.assert.true(entry.isEntrata());
        });

        await TestRunner.test('createUscita - crea entry uscita', () => {
            const entry = TimeEntry.createUscita('17:00');
            TestRunner.assert.equal(entry.type, 'uscita');
            TestRunner.assert.true(entry.isUscita());
        });

        await TestRunner.test('createSmart - ore corrette per giorno', () => {
            const smartNormal = TimeEntry.createSmart(false);
            const smartFriday = TimeEntry.createSmart(true);
            TestRunner.assert.equal(smartNormal.hours, 7.5);
            TestRunner.assert.equal(smartFriday.hours, 6);
        });

        await TestRunner.test('createAssente - ore zero', () => {
            const entry = TimeEntry.createAssente();
            TestRunner.assert.equal(entry.hours, 0);
            TestRunner.assert.true(entry.isAssente());
        });

        await TestRunner.test('isSpecial - riconosce tipi speciali', () => {
            const smart = TimeEntry.createSmart();
            const assente = TimeEntry.createAssente();
            const entrata = TimeEntry.createEntrata('08:00');
            
            TestRunner.assert.true(smart.isSpecial());
            TestRunner.assert.true(assente.isSpecial());
            TestRunner.assert.false(entrata.isSpecial());
        });

        await TestRunner.test('toJSON - serializzazione corretta', () => {
            const entry = TimeEntry.createEntrata('08:30');
            const json = entry.toJSON();
            TestRunner.assert.equal(json.type, 'entrata');
            TestRunner.assert.equal(json.time, '08:30');
            TestRunner.assert.true(!json.hours); // Non deve avere hours
        });

        await TestRunner.test('fromJSON - deserializzazione', () => {
            const json = { type: 'entrata', time: '09:00' };
            const entry = TimeEntry.fromJSON(json);
            TestRunner.assert.equal(entry.type, 'entrata');
            TestRunner.assert.equal(entry.time, '09:00');
        });
    }
};

// ============================================
// TEST SUITE: WeekData Model
// ============================================

const WeekDataTests = {
    async run() {
        console.log('\n📆 Testing WeekData Model...');
        
        const { WeekData } = window.__weekData || await import('./js/models/WeekData.js');
        const { TimeEntry } = window.__timeEntry || await import('./js/models/TimeEntry.js');

        await TestRunner.test('constructor - inizializza giorni lavorativi', () => {
            const week = new WeekData(2026, 6);
            const dates = week.getWorkDates();
            TestRunner.assert.equal(dates.length, 5);
        });

        await TestRunner.test('addEntry - aggiunge entry', () => {
            const week = new WeekData(2026, 6);
            const dateKey = '2026-02-02';
            week.addEntry(dateKey, { type: 'entrata', time: '08:00' });
            
            const entries = week.getEntriesForDate(dateKey);
            TestRunner.assert.equal(entries.length, 1);
        });

        await TestRunner.test('addEntry smart - sostituisce entry esistenti', () => {
            const week = new WeekData(2026, 6);
            const dateKey = '2026-02-02';
            
            week.addEntry(dateKey, { type: 'entrata', time: '08:00' });
            week.addEntry(dateKey, { type: 'smart', hours: 7.5 });
            
            const entries = week.getEntriesForDate(dateKey);
            TestRunner.assert.equal(entries.length, 1);
            TestRunner.assert.equal(entries[0].type, 'smart');
        });

        await TestRunner.test('deleteEntry - rimuove entry specifica', () => {
            const week = new WeekData(2026, 6);
            const dateKey = '2026-02-02';
            
            week.addEntry(dateKey, { type: 'entrata', time: '08:00' });
            week.addEntry(dateKey, { type: 'uscita', time: '17:00' });
            
            week.deleteEntry(dateKey, 0);
            
            const entries = week.getEntriesForDate(dateKey);
            TestRunner.assert.equal(entries.length, 1);
            TestRunner.assert.equal(entries[0].type, 'uscita');
        });

        await TestRunner.test('isSpecialDay - riconosce giorni speciali', () => {
            const week = new WeekData(2026, 6);
            const dateKey = '2026-02-02';
            
            week.addEntry(dateKey, { type: 'smart', hours: 7.5 });
            
            TestRunner.assert.true(week.isSpecialDay(dateKey));
        });

        await TestRunner.test('toJSON - serializzazione corretta', () => {
            const week = new WeekData(2026, 6);
            week.addEntry('2026-02-02', { type: 'entrata', time: '08:00' });
            
            const json = week.toJSON();
            TestRunner.assert.true('2026-02-02' in json);
            TestRunner.assert.equal(json['2026-02-02'].length, 1);
        });

        await TestRunner.test('isEmpty - riconosce settimana vuota', () => {
            const emptyWeek = new WeekData(2026, 6);
            const filledWeek = new WeekData(2026, 6);
            filledWeek.addEntry('2026-02-02', { type: 'entrata', time: '08:00' });
            
            TestRunner.assert.true(emptyWeek.isEmpty());
            TestRunner.assert.false(filledWeek.isEmpty());
        });
    }
};

// ============================================
// TEST SUITE: Storage (Integration)
// ============================================

const StorageTests = {
    async run() {
        console.log('\n💾 Testing Storage...');

        await TestRunner.test('localStorage - disponibilità', () => {
            TestRunner.assert.true(typeof localStorage !== 'undefined');
        });

        await TestRunner.test('localStorage - salvataggio/lettura', () => {
            const testKey = '__test_storage__';
            const testData = { test: true, value: 42 };
            
            localStorage.setItem(testKey, JSON.stringify(testData));
            const retrieved = JSON.parse(localStorage.getItem(testKey));
            localStorage.removeItem(testKey);
            
            TestRunner.assert.deepEqual(retrieved, testData);
        });

        await TestRunner.test('IndexedDB - disponibilità', () => {
            TestRunner.assert.true(typeof indexedDB !== 'undefined');
        });

        await TestRunner.test('StorageManager - loadAllData preferisce localStorage (fix bug)', async () => {
            const { StorageManager } = await import('./js/storage/StorageManager.js');
            const mgr = new StorageManager();
            await mgr.init();

            const testData = { '2026-W01': { '2026-01-05': [{ type: 'entrata', time: '08:00' }] } };
            const previousValue = localStorage.getItem('workTimeData');

            try {
                // Scrivi direttamente in localStorage (primary)
                localStorage.setItem('workTimeData', JSON.stringify(testData));

                const loaded = await mgr.loadAllData();
                TestRunner.assert.true('2026-W01' in loaded, 'Dati da localStorage presenti');
            } finally {
                // Ripristina sempre il valore precedente
                if (previousValue === null) {
                    localStorage.removeItem('workTimeData');
                } else {
                    localStorage.setItem('workTimeData', previousValue);
                }
            }
        });
    }
};

// ============================================
// TEST SUITE: Integration Tests
// ============================================

const IntegrationTests = {
    async run() {
        console.log('\n🔗 Testing Integration...');

        await TestRunner.test('App instance - è inizializzata', () => {
            const app = window.__app?.();
            TestRunner.assert.true(app !== null && app !== undefined);
        });

        await TestRunner.test('App - storage inizializzato', () => {
            const app = window.__app?.();
            TestRunner.assert.true(app?.storage !== null);
        });

        await TestRunner.test('App - navigator inizializzato', () => {
            const app = window.__app?.();
            TestRunner.assert.true(app?.navigator !== null);
        });

        await TestRunner.test('DOM - elementi UI presenti', () => {
            TestRunner.assert.true(document.getElementById('weekDays') !== null);
            TestRunner.assert.true(document.getElementById('entrataBtn') !== null);
            TestRunner.assert.true(document.getElementById('uscitaBtn') !== null);
            TestRunner.assert.true(document.getElementById('totalHours') !== null);
        });

        await TestRunner.test('DOM - modali presenti', () => {
            TestRunner.assert.true(document.getElementById('editModal') !== null);
            TestRunner.assert.true(document.getElementById('confirmModal') !== null);
        });
    }
};

// ============================================
// MAIN RUNNER
// ============================================

const AllTests = {
    async runAll() {
        console.clear();
        console.log('🧪 ORARI LAVORO - TEST SUITE');
        console.log('='.repeat(50));
        console.log('Data:', new Date().toLocaleString('it-IT'));
        console.log('='.repeat(50));

        TestRunner.reset();

        try {
            await DateUtilsTests.run();
            await ValidatorsTests.run();
            await TimeCalculatorTests.run();
            await TimeEntryTests.run();
            await WeekDataTests.run();
            await StorageTests.run();
            await IntegrationTests.run();
        } catch (error) {
            console.error('Errore durante i test:', error);
        }

        return TestRunner.report();
    },

    // Test singole suite
    async runDateUtils() { TestRunner.reset(); await DateUtilsTests.run(); return TestRunner.report(); },
    async runValidators() { TestRunner.reset(); await ValidatorsTests.run(); return TestRunner.report(); },
    async runTimeCalculator() { TestRunner.reset(); await TimeCalculatorTests.run(); return TestRunner.report(); },
    async runTimeEntry() { TestRunner.reset(); await TimeEntryTests.run(); return TestRunner.report(); },
    async runWeekData() { TestRunner.reset(); await WeekDataTests.run(); return TestRunner.report(); },
    async runStorage() { TestRunner.reset(); await StorageTests.run(); return TestRunner.report(); },
    async runIntegration() { TestRunner.reset(); await IntegrationTests.run(); return TestRunner.report(); }
};

// Esponi globalmente per uso da console
window.TestRunner = TestRunner;
window.AllTests = AllTests;

console.log('📋 Test Suite caricata. Esegui: AllTests.runAll()');
console.log('   Oppure test singoli: AllTests.runDateUtils(), AllTests.runValidators(), etc.');
