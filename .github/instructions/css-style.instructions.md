---
applyTo: "css/**/*.css"
---

# Istruzioni CSS — Timbra PA

## Design System

- Design ispirato a **iOS/Apple**: bordi arrotondati, ombre sfumate, colori vibranti
- Single file: `css/style.css` — tutto il CSS è qui
- Variabili CSS custom in `:root` per tutti i colori, spacing, radius, font
- Mobile-first, responsive con `@media (min-width: 600px)` per desktop

## Variabili Principali

```css
--color-primary: #007aff;     /* iOS blue */
--color-success: #34c759;     /* Verde */
--color-danger: #ff3b30;      /* Rosso */
--color-warning: #ff9500;     /* Arancione */
--color-smart: #af52de;       /* Viola smart working */
```

## Regole

- **MAI inline styles** — sempre classi CSS definite in `style.css`
- **MAI dipendenze CSS esterne** (no Bootstrap, no Tailwind)
- Usare le variabili CSS per colori e spacing
- Animazioni con `transition` e `@keyframes` — preferire `transform` e `opacity` per performance
- `-webkit-tap-highlight-color: transparent` su elementi interattivi touch
- `font-family: var(--font-family)` per tutto il testo

## Naming

- Classi BEM-like: `.day-card`, `.day-header`, `.day-entries`
- Modifier con prefisso: `.is-today`, `.is-open`, `.delta-positive`, `.type-entrata`
- State classes: `.is-visible`, `.has-install-banner`
