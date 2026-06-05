# 🦀 Craw Figma Connector

Bridge between AI agents (Craw, Claude Code, etc.) and Figma via a local HTTP server + Figma plugin.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your AI Agent (Craw)                     │
│                                                              │
│  design_orchestrator.js  (prompt → command sequence)        │
│  design_engine.js        (proportion-aware shape builder)    │
│  svg_to_figma.js         (SVG path → Figma vector)          │
│  figma_send.js           (raw command sender)                │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP POST :9199/send-command
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  figma_connector.js (:9199)                   │
│                                                              │
│  Queues commands from AI agents                              │
│  Stores results for polling                                  │
│  Health endpoint /health                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP polling (/next-command, /result)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Figma Plugin (code.js + ui.html)                │
│                                                              │
│  Plugin code: ES5, 27 commands, polls via UI proxy           │
│  UI: Badge, selection info, activity log                     │
│    (UI does XHR → plugin can't do HTTP directly in sandbox)  │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
                    ╔══════════╗
                    ║  FIGMA  ║
                    ╚══════════╝
```

## Quick Start

### Prerequisites
- Node.js 16+
- Figma Desktop app

### 1. Install
```bash
git clone https://github.com/missionarteemis-cloud/craw-figma-skill.git
cd craw-figma-skill
npm install    # only needed if Figma is also ran as npm
```

### 2. Import the plugin in Figma
1. Open **Figma Desktop**
2. Menu → Plugins → Development → **Import plugin from manifest**
3. Select `plugin/manifest.json`

### 3. Start the connector
```bash
node scripts/figma_connector.js
```
Listens on `http://localhost:9199`.

### 4. Launch the plugin in Figma
Right-click → Plugins → Development → **Craw Figma Connector**

The UI should show "Connected to Craw" (green dot).

### 5. Send a command
```bash
node scripts/figma_send.js getPageInfo
```
Expected response:
```json
{ "name": "Page 1", "id": "0:1", "childCount": 5 }
```

## Available Commands (27 total)

### Creation
| Command | Description |
|---------|-------------|
| `createRectangle` | Rectangle with fills, strokes, corner radius |
| `createFrame` | Frame with optional auto-layout params |
| `createEllipse` | Ellipse, optional arcData for pie slices |
| `createPolygon` | Polygon (triangle, pentagon, etc.) — `pointCount` |
| `createStar` | Star with custom `pointCount` and `innerRadius` |
| `createLine` | Straight line |
| `createVector` | Vector shape from vertices + bezier segments |
| `createText` | Text node with font, size, alignment |

### Selection & Manipulation
| Command | Description |
|---------|-------------|
| `selectNode` | Select by ID, optionally `addToSelection` |
| `updateNode` | Move, resize, recolor, rename, opacity, visibility |
| `deleteNode` | Remove node by ID |
| `duplicateNode` | Clone a node with offset |
| `moveNodes` | Reparent node into another frame |

### Styling
| Command | Description |
|---------|-------------|
| `setFillColor` | Solid color fill |
| `setGradient` | LINEAR / RADIAL gradient with stops |
| `setStroke` | Stroke color, weight, alignment, dash |
| `setEffects` | Shadows, blurs (see Figma API format) |

### Boolean Operations
| Command | Description |
|---------|-------------|
| `groupSelection` | Group selected nodes |
| `booleanOperation` | Union / Subtract / Intersect / Exclude |
| `flatten` | Flatten selected nodes into one vector |

### Components
| Command | Description |
|---------|-------------|
| `createComponent` | New component or from existing frame |
| `createInstance` | Instance of a component |

### Layout
| Command | Description |
|---------|-------------|
| `addAutoLayout` | Auto-layout mode, padding, spacing, alignment |

### Info
| Command | Description |
|---------|-------------|
| `getPageInfo` | Current page name, id, child count |
| `getSelection` | Selected nodes with position/size |
| `constrainProportions` | Toggle aspect ratio lock |
| `exportNode` | Export as PNG (base64 bytes) |

## Design Engine (Advanced)

The **Design Engine** is a higher-level layer that translates natural design intent into precise, proportion-aware Figma commands.

### Usage
```bash
# Print steps (dry run)
node scripts/design_engine.js --command heart --size 200 --color red

# Auto-execute via orchestrator
node scripts/design_orchestrator.js "disegnami un cuoricino rosso con ombra"

# SVG path → Figma vector (precise shapes)
node scripts/svg_to_figma.js --heart
node scripts/svg_to_figma.js --star5
```

### How the Design Engine works
1. Parses natural language prompt (shape, color, size, effects)
2. Calculates proportionally correct coordinates
3. Executes creation → selection → boolean union → styling in sequence
4. Returns the final node ID

### Integration with NotebookLM (Recommended)
For best results, feed the Design Engine with design knowledge via NotebookLM:
- [Refactoring UI](https://refactoringui.com/) — practical UI principles
- [Material Design 3](https://m3.material.io/) — Google's design system
- [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/) — Apple's guidelines
- [Atomic Design](https://atomicdesign.bradfrost.com/) — component methodology
- [Figma Auto Layout](https://help.figma.com/hc/en-us/articles/360568167748-Auto-layout) — layout best practices

When a reference NotebookLM notebook is linked, the Design Engine can consult it before generating commands, producing design-aware results.

## Architecture Details

### Plugin Polling
The plugin code (`code.js`) **cannot make HTTP requests** (Figma sandbox restriction). Instead:
1. Plugin code sends `postMessage("poll-command")` to the UI
2. UI (`ui.html`) performs `XMLHttpRequest` to the connector at `:9199`
3. Commands from the queue are forwarded back to the plugin code
4. Results go plugin → UI → HTTP POST → connector

### Connector
- Single HTTP server on `:9199`
- Three endpoints: `/send-command` (POST), `/next-command` (GET, dequeue), `/health` (GET)
- Stores pending commands and results in memory

### SVG to Vector
`svg_to_figma.js` converts standard SVG path strings (M, L, C, Q, Z) into Figma vector networks with bezier tangents. Supports:
- Absolute and relative coordinates
- Cubic bezier curves (C)
- Quadratic bezier curves (Q)
- Path closing (Z)

## Advanced: Design Tokens & Design System

For teams building design systems, the plugin supports:

- **Component creation** with `createComponent` / `createInstance`
- **Auto-layout** for responsive components via `addAutoLayout`
- **Design tokens** can be represented as parameter presets (colors, spacing, effects)

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Connected to Craw" but commands timeout | Reimport plugin (Figma caches `code.js`) |
| UI shows "Disconnected" | Restart `figma_connector.js` |
| `XMLHttpRequest` errors in console | Figma sandbox; UI does XHR, not code.js |
| `regions is read-only` error | Update to latest code.js (fix in v1.2.0) |
| Plugin not showing in list | Figma Desktop: reimport from `manifest.json` |
| Console errors after update | **Close Figma completely** (cmd+Q), reopen |

## Roadmap

- [ ] `figma.createNodeFromSvg()` wrapper (import SVG directly)
- [ ] Gradient presets (neon, glassmorphism, soft)
- [ ] Auto-animate / prototype links
- [ ] Cloud sync via Railway for multi-device access
- [ ] VS Code extension companion

---

Built for [OpenClaw](https://openclaw.ai) ecosystem.
