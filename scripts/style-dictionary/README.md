# Style Dictionary — Craw Figma Design Tokens

Questo pacchetto trasforma i design tokens del sistema di design di Craw
(DTCG format) in output utilizzabili: **CSS custom properties** per il web
e **JSON nidificato** per Figma.

## Struttura

```
scripts/style-dictionary/
├── config.json          — Configurazione (CSS + Figma outputs)
├── tokens/              — DTCG → SD convertiti automaticamente
│   ├── main.json        — Token core (spacing, typography, elevation, motion...)
│   └── drs-lab.json     — Token progetto DR's Lab (colori, font custom)
├── build/
│   ├── variables.css    — CSS custom properties (namespace `--color-*`, `--spacing-*`)
│   └── figma-tokens.json — JSON per Figma Tokens Studio (opzionale)
├── package.json
└── node_modules/
```

## Come eseguire

```bash
cd scripts/style-dictionary
npx style-dictionary build
```

Output generato in `build/`:
- `variables.css` — pronto per essere importato in un progetto web
- `figma-tokens.json` — per Figma Tokens Studio (o altro tool)

## Token disponibili

| Categoria | Prefisso CSS | Esempi |
|-----------|-------------|--------|
| Colori | `--color-*` | `--color-bg`, `--color-accent`, `--color-text` |
| Spaziatura | `--spacing-*` | `--spacing-sm`, `--spacing-lg`, `--spacing-xl` |
| Tipografia | `--typography-*` | `--typography-size-base`, `--typography-weight-bold` |
| Border radius | `--border-radius-*` | `--border-radius-md`, `--border-radius-full` |
| Elevation | `--elevation-*` | `--elevation-low`, `--elevation-high` |
| Opacità | `--opacity-*` | `--opacity-disabled`, `--opacity-muted` |
| Motion | `--motion-*` | `--motion-duration-fast`, `--motion-easing-out` |
| Icone | `--icon-*` | `--icon-sizes-md`, `--icon-stroke-bold` |
| Proporzioni | `--proportions-*` | `--proportions-heart-aspect-ratio` |

## Come aggiornare i token

1. Modifica i file in `design-tokens/design-tokens.json` e `design-tokens/projects/*.json`
2. Esegui il convertitore DTCG → SD (se necessario)
3. Esegui `npx style-dictionary build`

## Integrazione con design_engine.js

Il design engine carica i token direttamente da `design-tokens/`, non dal build di
Style Dictionary. Style Dictionary è usato per generare CSS variables e figma tokens
da usare nei progetti frontend o in Figma.
