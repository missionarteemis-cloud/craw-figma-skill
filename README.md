# 🦀 Craw Figma Connector

**AI-powered bridge between AI agents (Craw, Claude Code) and Figma.**
Create shapes, apply auto-layout, run boolean operations, and generate vector networks — all from a prompt.

![Craw Figma Connector](plugin/icon.png)

---

## Quick Start

### Prerequisites
- **Node.js** 16+ (tested up to v26)
- **Figma Desktop** (free tier works)
- **Python 3.8+** (for Style Dictionary)

### 1. Clone & Install
```bash
git clone https://github.com/missionarteemis-cloud/craw-figma-skill.git
cd craw-figma-skill
```

### 2. Install plugin in Figma Desktop
1. Open **Figma Desktop**
2. Menu → **Plugins** → **Development** → **Import plugin from manifest...**
3. Select `plugin/manifest.json`
4. The plugin appears as **"Craw Figma Connector"** in dev plugins

### 3. Start the connector server
```bash
node scripts/figma_connector.js
```
Server listens on `http://localhost:9199`. Configurable via `--port` flag.

### 4. Launch the plugin in Figma
Right-click canvas → **Plugins** → **Development** → **Craw Figma Connector**

Green dot = connected. You're ready.

### 5. Test it
```bash
# Read current page info
node scripts/figma_send.js getPageInfo

# Create a rectangle
node scripts/figma_send.js '{"command":"createRectangle","payload":{"x":100,"y":100,"width":200,"height":150,"fills":[{"type":"SOLID","color":{"r":0.14,"g":0.49,"b":1}}]}}'
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Your AI Agent (Craw)                 │
│                                                       │
│  design_orchestrator.js   → command sequence          │
│  shape_generator.js        → polygons, hearts, union  │
│  auto_layout.js            → cards, rows, columns     │
│  svg_to_figma.js           → SVG path → vector        │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP POST :9199/send-command
                       ▼
┌─────────────────────────────────────────────────────┐
│               figma_connector.js (:9199)              │
│                                                       │
│  Queues commands from AI agents                       │
│  Default timeout: 30s (env FIGMA_CMD_TIMEOUT)         │
│  Endpoints: /send-command, /next-command, /health     │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP polling (UI proxy)
                       ▼
┌─────────────────────────────────────────────────────┐
│            Figma Plugin (code.js + ui.html)           │
│                                                       │
│  ⚠️ Figma sandbox blocks HTTP from plugin code        │
│  ✅ UI layer does XHR on behalf of plugin code         │
│  27+ commands: shapes, styling, layout, components    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
                   ╔══════════╗
                   ║  FIGMA  ║
                   ╚══════════╝
```

**Why the UI proxy?** Figma's plugin sandbox blocks direct HTTP requests. The plugin's `code.js` communicates with the UI via `postMessage`, and the UI (`ui.html`) performs the actual HTTP requests to the local connector. This is a known Figma limitation, not a design flaw.

---

## Features

### 🎨 Shape Generator
Create any shape with smart positioning:

```bash
# Demo: all basic shapes in a grid
node scripts/shape_generator.js test-basic

# Demo: union of two circles
node scripts/shape_generator.js test-union

# Single shape
node scripts/shape_generator.js test-heart

# Grid from JSON
node scripts/shape_generator.js grid '[{"type":"rect","cornerRadius":12,"name":"Button","width":160,"height":48}]'
```

Supported shapes: rectangles, ellipses, polygons (N sides), stars (N points + innerRadius), hearts (bezier), vector paths, boolean unions.

### 📐 Auto Layout
Modular spacing system based on multiples of 8 (Refactoring UI principles):

```bash
node scripts/auto_layout.js button '{"name":"CTA"}'
node scripts/auto_layout.js card '{"width":320}'
node scripts/auto_layout.js row '{"padding":8}'
node scripts/auto_layout.js column '{"padding":16}'
```

Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 40 / 64 / 80

### 🔷 Boolean Operations
Union, subtract, intersect, exclude shapes:

```bash
# From the plugin, select two overlapping nodes and run:
node scripts/figma_send.js '{"command":"booleanOperation","payload":{"nodeIds":["ID1","ID2"],"operation":"UNION"}}'
```

### 📐 Design Engine
Natural language → precise Figma commands:

```bash
node scripts/design_engine.js --command heart --size 200 --color red
node scripts/design_engine.js --command star --points 5 --size 150 --color gold
```

### 🎯 Design Critic
Analyze generated designs against best practices:

```bash
# Read a Figma file and analyze its design quality
node scripts/design_critic.js
```

### 📊 Style Dictionary Pipeline
Transform design tokens into CSS variables and Figma tokens:

```bash
cd scripts/style-dictionary
npx style-dictionary build
# Output: build/variables.css (74+ CSS custom properties)
# Output: build/figma-tokens.json (Figma-compatible format)
```

### 🔍 SVG to Vector
Convert SVG paths to Figma VectorNetwork:

```bash
node scripts/svg_to_figma.js --heart
node scripts/svg_to_figma.js --star5
```

### 📖 Design Tokens (DTCG Format)
Full design token system:

```
design-tokens/
├── design-tokens.json       — Core tokens (spacing, typography, elevation, motion...)
├── projects/drs-lab.json    — DR's Lab project-specific tokens
└── load-tokens.js           — Utility to load tokens into design engine
```

---

## All Commands

### Plugin Commands (send via figma_send.js)

| Category | Commands |
|----------|----------|
| **Create** | `createRectangle`, `createFrame`, `createEllipse`, `createPolygon`, `createStar`, `createLine`, `createVector`, `createVectorNetwork`, `createText` |
| **Select** | `selectNode`, `getSelection`, `getPageInfo` |
| **Modify** | `updateNode`, `deleteNode`, `duplicateNode`, `moveNodes` |
| **Style** | `setFillColor`, `setGradient`, `setStroke`, `setEffects`, `constrainProportions` |
| **Boolean** | `booleanOperation` (UNION / SUBTRACT / INTERSECT / EXCLUDE), `groupSelection`, `flatten` |
| **Components** | `createComponent`, `createInstance` |
| **Layout** | `addAutoLayout`, updateNode with layout properties |
| **Export** | `exportNode`, `importSvg` |

### Read Commands (via figma_client.mjs)

| Command | Description |
|---------|-------------|
| `get-file <key>` | Full file document tree |
| `get-file-nodes <key> <id>...` | Specific nodes by ID |
| `get-styles <key>` | Published styles |
| `get-components <key>` | Published components |
| `render-images <key> <id>` | Export as images |
| `me` | Current user info |

---

## Installation & Setup

### Connector Server (figma_connector.js)
```bash
# Default port 9199
node scripts/figma_connector.js

# Custom port
node scripts/figma_connector.js --port 9200

# Custom timeout (default 30s, useful for boolean operations)
FIGMA_CMD_TIMEOUT=60000 node scripts/figma_connector.js
```

### Style Dictionary (optional — for token → CSS)
```bash
cd scripts/style-dictionary
npm install
npx style-dictionary build
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FIGMA_CONNECTOR` | `http://localhost:9199` | Connector server URL |
| `FIGMA_CMD_TIMEOUT` | `30000` | Command timeout in ms |
| `FIGMA_ACCESS_TOKEN` | — | Figma REST API token (for read commands) |

---

## Publishing

### Figma Community
1. Open Figma Desktop
2. Menu → **Plugins** → **Development** → **Publish plugin...**
3. Fill in: name, description, icon (use `plugin/icon.png`)
4. Select **Public** or **Organization** scope
5. Submit for review

### GitHub
```bash
# Initialize git (if not done)
git init
git add .
git commit -m "Initial release: Craw Figma Connector"

# Create repo on GitHub, then:
git remote add origin https://github.com/missionarteemis-cloud/craw-figma-skill.git
git push -u origin main
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Green dot but commands timeout | **Reimport plugin** (Figma caches `code.js`) |
| "Disconnected" in plugin UI | Restart `figma_connector.js` |
| Font errors | Open Figma + click text once to trigger font loading |
| `XMLHttpRequest` errors | Normal — the UI layer handles this, not code.js |
| Plugin not in dev list | Reimport from `plugin/manifest.json` |
| Syntax error after update | **Close Figma completely** (cmd+Q), reopen |

---

## Development

### Project structure
```
craw-figma-skill/
├── SKILL.md                           — OpenClaw skill definition
├── README.md                          ← You are here
├── plugin/
│   ├── manifest.json                  — Figma plugin manifest
│   ├── code.js                        — Plugin code (ES5, 27+ commands)
│   ├── code.ts                        — TypeScript source
│   ├── ui.html                        — Plugin UI (badge + log)
│   ├── icon.svg                       — Plugin icon source
│   └── icon.png                       — 128px icon
├── scripts/
│   ├── figma_connector.js             — Local HTTP server (core)
│   ├── figma_send.js                  — Raw command sender
│   ├── figma_client.mjs              — Figma REST API client
│   ├── shape_generator.js            — Multi-shape generator with grid
│   ├── auto_layout.js                 — Auto Layout module (8x spacing)
│   ├── design_engine.js              — Proportion-aware shape builder
│   ├── design_orchestrator.js        — NL → command with NotebookLM
│   ├── design_critic.js              — Design critique analysis
│   ├── svg_to_figma.js               — SVG path → VectorNetwork
│   ├── heart_generator.js            — Legacy heart generator
│   ├── star_generator.js             — Legacy star generator
│   ├── style_auditor.mjs            — Design system analysis
│   ├── accessibility_checker.mjs     — WCAG compliance checker
│   ├── craw_design_cmd.sh           — Shell command wrapper
│   └── style-dictionary/             — Token → CSS pipeline
│       ├── config.json               — Style Dictionary config
│       ├── tokens/                   — DTCG tokens (auto-converted)
│       ├── build/variables.css       — Generated CSS variables
│       └── README.md                 — Pipeline documentation
├── design-tokens/
│   ├── design-tokens.json            — Core design tokens
│   └── projects/drs-lab.json         — DR's Lab project tokens
└── references/
    ├── figma-api-reference.md        — REST API docs
    └── design-patterns.md            — UI patterns & best practices
```

---

## Roadmap

- [ ] `createNodeFromSvgAsync` wrapper (import SVG directly)
- [ ] Gradient presets (neon, glassmorphism, soft)
- [ ] Auto-animate / prototype links
- [ ] Cloud sync via Railway for multi-device
- [ ] VS Code extension companion
- [ ] Figma Community publication

---

Built for the [OpenClaw](https://openclaw.ai) ecosystem.  
License: MIT
