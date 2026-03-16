# ⏰ Timbra PA

PWA per tracciare le timbrature dei dipendenti pubblici italiani.
Funziona offline, si installa come app e salva i dati solo sul dispositivo.

![Screenshot App](docs/screenshot.svg)

---

## ✨ Funzionalità

- 36 ore settimanali con saldo aggiornato in tempo reale
- Pausa pranzo automatica: con coppia singola lun-gio 30 minuti fissi, con multi-timbrature conta la pausa reale; venerdì solo oltre 6h lorde
- Smart working e assenze con ore precompilate
- Timbrature multiple nello stesso giorno
- Suggerimento uscita del venerdì in base agli extra accumulati
- Export JSON e CSV
- Funzionamento offline e installazione come PWA

---

## 🔐 I tuoi dati sono tuoi

- Nessun account
- Nessun backend
- Storage locale: localStorage come primario, IndexedDB come fallback
- Export manuale quando vuoi

Nota iOS: Safari può eliminare i dati PWA dopo 7 giorni di inutilizzo. Conviene aprire l'app almeno una volta a settimana o esportare periodicamente un backup JSON.

---

## 🚀 Inizia subito

👉 **[Apri Timbra PA](https://vtvito.github.io/italian-pa-employee-attendance/)**

Installazione rapida:
- Android: apri il link in Chrome e tocca "Installa" o "Aggiungi a schermata Home"
- iPhone/iPad: apri in Safari o Chrome, poi Condividi → "Aggiungi a Home"
- Desktop: apri in Chrome o Edge e usa il pulsante Installa nella barra indirizzi

---

## 🏗️ Per sviluppatori

Pattern **MVC + Observer + Repository**, zero dipendenze:

```
js/
├── app.js               # Bootstrap, SW registration, update flow
├── controllers/
│   └── AppController.js # Orchestrazione MVC
├── models/
│   ├── TimeEntry.js     # Singola timbratura
│   └── WeekData.js      # Dati settimana
├── views/
│   ├── UIManager.js     # Rendering UI, toast, PWA install
│   └── ModalManager.js  # Modali (edit, add, confirm, clean)
├── services/
│   ├── TimeCalculator.js # Calcoli ore, pause, delta, suggerimento venerdì
│   ├── WeekNavigator.js  # Navigazione settimane ISO 8601
│   └── ExportService.js  # Export JSON / CSV, import
├── storage/
│   ├── StorageManager.js     # Repository pattern, dual storage
│   ├── LocalStorageAdapter.js
│   └── IndexedDBAdapter.js
└── utils/
    ├── EventBus.js      # Pub/Sub con eventi tipizzati
    ├── DateUtils.js     # ISO 8601, formatting, parsing
    └── Validators.js    # Validazione orari
```

Stack: Vanilla JavaScript ES Modules, CSS singolo, localStorage + IndexedDB, Service Worker, manifest PWA.

### Avvio locale

```bash
git clone https://github.com/VTvito/italian-pa-employee-attendance.git
cd italian-pa-employee-attendance
python -m http.server 8000
```

### Test

```bash
http://localhost:8000/tests/
```

---

## 📋 Configurazione

Le costanti principali sono in [js/services/TimeCalculator.js](js/services/TimeCalculator.js):

```javascript
export const CONFIG = {
    WEEKLY_TARGET_HOURS: 36,
    PAUSE_MINUTES: 30,
    PAUSE_THRESHOLD_HOURS: 6,
    SMART_HOURS_DEFAULT: 7.5,
    SMART_HOURS_FRIDAY: 6,
    DAILY_TARGET_HOURS: 7.5,
    FRIDAY_TARGET_HOURS: 6
};
```

---

## 🌐 Self-hosting

Qualsiasi hosting statico va bene: GitHub Pages, Netlify, Vercel, Cloudflare Pages o un semplice server HTTP.

---

## 🤝 Contribuisci

Pull request benvenute. Per modifiche sostanziali conviene aprire prima una issue.

---

## 📄 Licenza

Distribuito sotto licenza **MIT** — vedi [LICENSE](LICENSE).

---

## 👤 Autore

**VTvito** — [@VTvito](https://github.com/VTvito)
